import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// NEBIUS_BUDGET_RUNTIME_DIR routes staging to the workspace temp directory.
const MILLION = 1_000_000n;
const MAX_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

export class BudgetError extends Error {
  constructor(message, code, status = 503) {
    super(message); this.name = 'BudgetError'; this.code = code; this.status = status;
  }
}

const invalid = (field) => new BudgetError(`Budget configuration requires a valid ${field}.`, 'budget_invalid');

function decimal(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid(field);
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  if (scale > 6) throw invalid(`${field} with at most six decimal places`);
  return scale > 0
    ? { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(scale) }
    : { numerator: BigInt(whole + fraction) * 10n ** BigInt(-scale), denominator: 1n };
}

function micros(value, field) {
  const amount = decimal(value, field);
  const result = amount.numerator * MILLION / amount.denominator;
  if (result > MAX_INTEGER) throw invalid(field);
  return Number(result);
}

function resolveFile(file) {
  const configured = file ?? process.env.NEBIUS_BUDGET_FILE;
  if (typeof configured !== 'string' || !configured.trim()) {
    throw new BudgetError('Create a private budget file and set NEBIUS_BUDGET_FILE.', 'budget_setup');
  }
  try { return fs.realpathSync(path.resolve(configured)); }
  catch { throw new BudgetError('The configured budget file is missing or inaccessible.', 'budget_file'); }
}

function readBudget(file) {
  let config;
  try {
    if (!fs.statSync(file).isFile()) throw new Error('file type');
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { throw new BudgetError('The budget file requires readable JSON.', 'budget_file'); }
  if (!config || typeof config !== 'object' || Array.isArray(config) || config.version !== 1) throw invalid('version 1 object');
  if (typeof config.model !== 'string' || !config.model.trim() || config.model !== config.model.trim()) throw invalid('model');
  const inputPrice = decimal(config.inputUsdPerMillion, 'inputUsdPerMillion');
  const outputPrice = decimal(config.outputUsdPerMillion, 'outputUsdPerMillion');
  if (inputPrice.numerator + outputPrice.numerator === 0n) throw invalid('positive token price');
  const approvedMicroUsd = micros(config.approvedUsd, 'approvedUsd');
  const credits = micros(config.confirmedCreditsUsd, 'confirmedCreditsUsd');
  const reserve = micros(config.creditReserveUsd, 'creditReserveUsd');
  if (reserve > credits || approvedMicroUsd > credits - reserve) {
    throw new BudgetError('Set approvedUsd within confirmedCreditsUsd minus creditReserveUsd.', 'budget_credit_limit');
  }
  if (!Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 1) throw invalid('maxOutputTokens');
  if (!Number.isSafeInteger(config.reservedMicroUsd) || config.reservedMicroUsd < 0 || config.reservedMicroUsd > approvedMicroUsd) throw invalid('reservedMicroUsd');
  if (!Number.isSafeInteger(config.requests) || config.requests < 0 || config.requests >= Number.MAX_SAFE_INTEGER
    || (config.requests === 0) !== (config.reservedMicroUsd === 0)) throw invalid('requests');
  if (typeof config.expiresAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(config.expiresAt)
    || !Number.isFinite(Date.parse(config.expiresAt))) throw invalid('expiresAt with timezone');
  if (Date.parse(config.expiresAt) <= Date.now()) {
    throw new BudgetError('The budget approval expired. Review credits and renew the approval.', 'budget_expired');
  }
  return { config, inputPrice, outputPrice, approvedMicroUsd, remainingMicroUsd: approvedMicroUsd - config.reservedMicroUsd };
}

function remainingStatus(budget) {
  if (budget.remainingMicroUsd <= 0) throw new BudgetError('The approved budget is exhausted. Review the private ledger.', 'budget_reached', 429);
  return { ready: true, code: 'budget_ready', message: 'The approved credit budget is active.',
    model: budget.config.model, approvedMicroUsd: budget.approvedMicroUsd,
    reservedMicroUsd: budget.config.reservedMicroUsd, remainingMicroUsd: budget.remainingMicroUsd,
    requests: budget.config.requests, expiresAt: budget.config.expiresAt, maxOutputTokens: budget.config.maxOutputTokens };
}

export function budgetStatus({ file } = {}) {
  try { return remainingStatus(readBudget(resolveFile(file))); }
  catch (error) {
    return { ready: false, code: error.code || 'budget_file', message: error.message,
      status: error.status || 503, remainingMicroUsd: 0 };
  }
}

const ceilPrice = (tokens, price) => (BigInt(tokens) * price.numerator + price.denominator - 1n) / price.denominator;

/** Reserve the full cost before HTTP. Every reservation survives provider failures and restarts. */
export function reserveBudget({ model, request, file } = {}) {
  const target = resolveFile(file);
  const runtimeDirectory = path.resolve(process.env.NEBIUS_BUDGET_RUNTIME_DIR || path.join(process.cwd(), 'temp/dockproof-budget'));
  const key = createHash('sha256').update(target).digest('hex');
  const lock = path.join(runtimeDirectory, `${key}.lock`);
  let lockFd;
  try {
    fs.mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
    lockFd = fs.openSync(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new BudgetError('A budget reservation is active. Retry after it finishes.', 'budget_busy', 409);
    throw new BudgetError('Budget lock creation failed. Restore the private runtime directory.', 'budget_write');
  }
  let staging;
  try {
    const budget = readBudget(target);
    remainingStatus(budget);
    if (model !== budget.config.model || request?.model !== model) {
      throw new BudgetError('Use the model ID approved in the private budget.', 'budget_model', 400);
    }
    if (!Number.isSafeInteger(request?.max_tokens) || request.max_tokens < 1 || request.max_tokens > budget.config.maxOutputTokens
      || (request.n !== undefined && request.n !== 1) || request.max_completion_tokens !== undefined || request.max_output_tokens !== undefined) {
      throw new BudgetError('Use one completion and a positive max_tokens within the approved output limit.', 'budget_output_limit', 400);
    }
    let requestJson;
    try { requestJson = JSON.stringify(request); }
    catch { throw new BudgetError('Supply a JSON-serializable model request.', 'budget_request', 400); }
    const inputTokenUpperBound = Buffer.byteLength(requestJson, 'utf8') + 4096;
    const outputTokenUpperBound = request.max_tokens;
    const cost = ceilPrice(inputTokenUpperBound, budget.inputPrice) + ceilPrice(outputTokenUpperBound, budget.outputPrice);
    if (cost > BigInt(budget.remainingMicroUsd)) {
      throw new BudgetError('This request exceeds the remaining approved budget. Review the private ledger.', 'budget_reached', 429);
    }
    const reservedMicroUsd = Number(cost);
    const next = { ...budget.config, reservedMicroUsd: budget.config.reservedMicroUsd + reservedMicroUsd,
      requests: budget.config.requests + 1 };
    staging = path.join(runtimeDirectory, `${key}.${randomUUID()}.json`);
    const fd = fs.openSync(staging, 'wx', 0o600);
    try { fs.writeFileSync(fd, `${JSON.stringify(next, null, 2)}\n`); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(staging, target);
    staging = undefined;
    const dirFd = fs.openSync(path.dirname(target), 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    return { reservationId: next.requests, reservedMicroUsd, remainingMicroUsd: budget.remainingMicroUsd - reservedMicroUsd,
      totalReservedMicroUsd: next.reservedMicroUsd, inputTokenUpperBound, outputTokenUpperBound, requestJson };
  } catch (error) {
    if (error instanceof BudgetError) throw error;
    throw new BudgetError('Budget persistence failed. Restore the private ledger before retrying.', 'budget_write');
  } finally {
    if (staging) { try { fs.unlinkSync(staging); } catch {} }
    try { fs.closeSync(lockFd); fs.unlinkSync(lock); }
    catch { throw new BudgetError('Budget lock cleanup failed. Restore the private runtime directory.', 'budget_write'); }
  }
}
