'use strict';

class ServerlessError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

Object.defineProperty(ServerlessError.prototype, 'name', {
  value: ServerlessError.name,
  configurable: true,
  writable: true,
});

module.exports = ServerlessError;
