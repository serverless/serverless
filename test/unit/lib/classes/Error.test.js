'use strict';

const expect = require('chai').expect;
const sandbox = require('sinon');
const ServerlessError = require('../../../../lib/classes/Error').ServerlessError;
const logWarning = require('../../../../lib/classes/Error').logWarning;

describe('ServerlessError', () => {
  describe('#constructor()', () => {
    it('should store message', () => {
      const error = new ServerlessError('a message', 'a status code');
      expect(error.message).to.be.equal('a message');
    });

    it('should store name', () => {
      const error = new ServerlessError('a message', 'a status code');
      expect(error.name).to.be.equal('ServerlessError');
    });

    it('should store status code', () => {
      const error = new ServerlessError('a message', 'ERROR_CODE');
      expect(error.code).to.be.equal('ERROR_CODE');
    });

    it('message should always resolve as string', () => {
      const error = new ServerlessError({});
      expect(typeof error.message).to.be.equal('string');
    });

    it('should have stack trace', () => {
      let expectedError;
      function testStackFrame() {
        expectedError = new ServerlessError('a message', 'a status code');
        throw expectedError;
      }

      let thrownError;
      try {
        testStackFrame();
      } catch (e) {
        thrownError = e;
      }

      expect(thrownError).to.exist; // eslint-disable-line no-unused-expressions
      expect(thrownError).to.deep.equal(expectedError);
      expect(thrownError.stack).to.exist; // eslint-disable-line no-unused-expressions
      expect(thrownError.stack).to.have.string('testStackFrame');
      expect(thrownError.stack).to.not.have.string('new ServerlessError');
      expect(thrownError.stack).to.not.have.string('Error.js');
    });
  });
});

describe('#logWarning()', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = sandbox.spy(console, 'log');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should log warning and proceed', () => {
    logWarning('a message');

    const message = consoleLogSpy.args.join('\n');

    expect(consoleLogSpy.called).to.equal(true);
    expect(message).to.have.string('Serverless Warning');
    expect(message).to.have.string('a message');
  });
});
