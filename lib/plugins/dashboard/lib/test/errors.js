'use strict';

module.exports.TestError = class TestError extends Error {
  constructor(field, expected, received, resp, body) {
    super(
      `Test failed, expected: ${JSON.stringify(expected)}, received: ${JSON.stringify(received)}`
    );
    Object.assign(this, { field, expected, received, resp, body });
  }
};
