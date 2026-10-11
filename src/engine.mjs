import { Store } from './store.mjs';
import { Raincheck as Core } from './engine-core.mjs';

export class Raincheck extends Core {
  constructor({ filename = ':memory:', store, ...options } = {}) {
    super({ ...options, store: store || new Store(filename) });
  }
}
