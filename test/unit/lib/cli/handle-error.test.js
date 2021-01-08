'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const path = require('path');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const handleError = require('../../../../lib/cli/handle-error');
const isStandaloneExecutable = require('../../../../lib/utils/isStandaloneExecutable');
const { ServerlessError } = require('../../../../lib/classes/Error');

describe('test/unit/lib/cli/handle-error.test.js', () => {
  it('should log environment information', async () => {
    let stdoutData = '';
    await overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => handleError(new ServerlessError('Test error'))
    );
    expect(stdoutData).to.have.string('Serverless Error');
    expect(stdoutData).to.have.string('Test error');
    expect(stdoutData).to.have.string('Your Environment Information');
    expect(stdoutData).to.have.string('Operating System:');
    expect(stdoutData).to.have.string('Node Version:');
    expect(stdoutData).to.have.string('Framework Version:');
    expect(stdoutData).to.have.string('Plugin Version:');
    expect(stdoutData).to.have.string('Components Version:');
  });

  it('should support `isUncaughtException` option', async () => {
    const processExitStub = sinon.stub(process, 'exit').returns();
    try {
      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        () => handleError(new ServerlessError('Test error'), { isUncaughtException: true })
      );
      expect(processExitStub.called).to.be.true;
    } finally {
      processExitStub.restore();
    }
  });

  if (isStandaloneExecutable) {
    it('should report standalone installation', async () => {
      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        () => handleError(new ServerlessError('Test error'))
      );
      expect(stdoutData).to.have.string('(standalone)');
    });
  } else {
    it('should support `isLocallyInstalled` option', async () => {
      let stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        () => handleError(new ServerlessError('Test error'), { isLocallyInstalled: false })
      );
      expect(stdoutData).to.not.have.string('(local)');
      stdoutData = '';
      await overrideStdoutWrite(
        (data) => (stdoutData += data),
        () => handleError(new ServerlessError('Test error'), { isLocallyInstalled: true })
      );
      expect(stdoutData).to.have.string('(local)');
    });
  }

  it('should print stack trace with SLS_DEBUG', async () => {
    let stdoutData = '';
    process.env.SLS_DEBUG = '1';
    await overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => handleError(new ServerlessError('Test error'))
    );
    expect(stdoutData).to.have.string(path.basename(__filename));
  });

  it('should not print stack trace without SLS_DEBUG', async () => {
    let stdoutData = '';
    delete process.env.SLS_DEBUG;
    await overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => handleError(new ServerlessError('Test error'))
    );
    expect(stdoutData).to.not.have.string(path.basename(__filename));
  });

  it('should handle non-error objects', async () => {
    let stdoutData = '';
    await overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => handleError('NON-ERROR')
    );
    expect(stdoutData).to.have.string('NON-ERROR');
  });
});
