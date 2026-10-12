import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { reserveRaincheckBudget } from '../src/budget.mjs';
import { LiveInterpreter } from '../src/interpreter.mjs';
import { seed, recordedIntents } from '../src/seed.mjs';

test('live AI requires its product cap and reserves both budgets before dispatch', async () => {
  const parent = path.resolve(process.env.RAINCHECK_TEST_DIR || '../../temp/raincheck-tests');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'budget-'));
  const globalFile = path.join(dir, 'global.json'), productFile = path.join(dir, 'product.json');
  const config = { ...JSON.parse(fs.readFileSync(new URL('../budget.example.json', import.meta.url), 'utf8')),
    confirmedCreditsUsd: 1, approvedUsd: 1, expiresAt: new Date(Date.now() + 60000).toISOString() };
  for (const file of [globalFile, productFile]) fs.writeFileSync(file, JSON.stringify(config));
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const names = ['NEBIUS_BUDGET_FILE', 'NEBIUS_BUDGET_RUNTIME_DIR', 'RAINCHECK_BUDGET_FILE'];
  const previous = names.map(name => process.env[name]);
  let dispatches = 0;
  try {
    process.env.NEBIUS_BUDGET_FILE = globalFile;
    process.env.NEBIUS_BUDGET_RUNTIME_DIR = dir;
    delete process.env.RAINCHECK_BUDGET_FILE;
    const interpreter = new LiveInterpreter({ apiKey: 'local-test', baseUrl: 'https://example.invalid',
      model: config.model, reserve: reserveRaincheckBudget, fetchImpl: async () => {
        dispatches++;
        assert.equal(read(globalFile).requests, 1);
        assert.equal(read(productFile).requests, 1);
        assert.equal(read(productFile).reservedMicroUsd, read(globalFile).reservedMicroUsd);
        return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop',
          message: { content: JSON.stringify(recordedIntents.mina) } }] }) };
      } });
    const input = { booking: seed.bookings[0], sessions: seed.sessions, message: seed.bookings[0].message, cancellation: seed.cancellation };
    await assert.rejects(interpreter.interpret(input), { code: 'budget_setup' });
    assert.equal(read(globalFile).requests, 0);
    process.env.RAINCHECK_BUDGET_FILE = productFile;
    await interpreter.interpret(input);
    const exhausted = read(productFile);
    exhausted.approvedUsd = exhausted.reservedMicroUsd / 1_000_000;
    fs.writeFileSync(productFile, JSON.stringify(exhausted));
    await assert.rejects(interpreter.interpret(input), { code: 'budget_reached' });
    assert.equal(dispatches, 1);
    assert.equal(read(globalFile).requests, 1);
  } finally {
    names.forEach((name, i) => previous[i] === undefined ? delete process.env[name] : process.env[name] = previous[i]);
  }
});
