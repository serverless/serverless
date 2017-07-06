'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const errorReporter = require('../utils/sentry').raven;
const ServerlessError = require('./Error').ServerlessError;
const logError = require('./Error').logError;
const logWarning = require('./Error').logWarning;

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
      const error = new ServerlessError('a message', 'a status code');
      expect(error.statusCode).to.be.equal('a status code');
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

describe('Error', () => {
  let sandbox;
  let consoleLogSpy;
  let processExitStub;
  let captureExceptionStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    consoleLogSpy = sandbox.spy(console, 'log');
    // the following is used so that the process exiting never interrupts tests
    processExitStub = sandbox.stub(process, 'exit').withArgs(1).returns();
    captureExceptionStub = sandbox.stub(errorReporter, 'captureException').yields();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#logError()', () => {
    beforeEach(() => {
      delete process.env.SLS_DEBUG;
    });

    it('should log error and exit', () => {
      const error = new ServerlessError('a message', 'a status code');
      logError(error);

      // TODO @David Not sure how to make async test for this
      // If tracking enabled, the process exits in a callback and is not defined yet
      // expect(this.processExitCodes.length).to.be.equal(1);
      // expect(this.processExitCodes).gt(0);

      const message = consoleLogSpy.args.join('\n');

      expect(consoleLogSpy.called).to.equal(true);
      expect(message).to.have.string('Serverless Error');
      expect(message).to.have.string('a message');
    });

    it('should capture the exception and exit the process with 1 if errorReporter is setup', () => {
      const error = new Error('an unexpected error');
      logError(error);

      expect(captureExceptionStub.args[0][0]).to.deep.equal(error);
      expect(processExitStub.called).to.equal(true);
      expect(processExitStub.calledWithExactly(1)).to.equal(true);
    });

    it('should notify about SLS_DEBUG and ask report for unexpected errors', () => {
      const error = new Error('an unexpected error');
      logError(error);

      const message = consoleLogSpy.args.join('\n');

      expect(consoleLogSpy.called).to.equal(true);
      expect(message).to.have.string('SLS_DEBUG=*');
    });

    it('should print stack trace with SLS_DEBUG', () => {
      process.env.SLS_DEBUG = 1;
      const error = new ServerlessError('a message');
      logError(error);

      const message = consoleLogSpy.args.join('\n');

      expect(consoleLogSpy.called).to.equal(true);
      expect(message).to.have.string('Stack Trace');
      expect(message).to.have.string(error.stack);
    });

    it('should not print stack trace without SLS_DEBUG', () => {
      const error = new ServerlessError('a message');
      logError(error);

      const message = consoleLogSpy.args.join('\n');

      expect(consoleLogSpy.called).to.equal(true);
      expect(message).to.not.have.string('Stack Trace');
      expect(message).to.not.have.string(error.stack);
    });

    it('should re-throw error when handling raises an exception itself', () => {
      const handlingError = new Error('an unexpected error');

      let thrownError = null;
      try {
        logError('INVALID INPUT');
      } catch (e) {
        thrownError = e;
      }

      expect(thrownError).to.deep.equal(handlingError);
    });
  });

  describe('#logWarning()', () => {
    it('should log warning and proceed', () => {
      logWarning('a message');

      const message = consoleLogSpy.args.join('\n');

      expect(consoleLogSpy.called).to.equal(true);
      expect(message).to.have.string('Serverless Warning');
      expect(message).to.have.string('a message');
    });
  });
});
