import { handle } from './handler.js';
export { StateStore } from './store.js';

export default {
  fetch(req, env) {
    return handle(req, env);
  }
};
