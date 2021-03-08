'use strict';

class VariableSourceResolutionError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

Object.defineProperty(VariableSourceResolutionError.prototype, 'name', {
  value: VariableSourceResolutionError.name,
  configurable: true,
  writable: true,
});

module.exports = VariableSourceResolutionError;
