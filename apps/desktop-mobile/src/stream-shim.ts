/**
 * This is a minimal shim for the Node.js 'stream' module
 * providing only what is required by legacy libraries like xlsx-js-style
 * to run in a browser environment.
 */
export class Readable {
  constructor() {}
  on() { return this; }
  pipe() { return this; }
  push() { return true; }
}

export default {
  Readable,
};
