'use strict';

const chai = require('chai');
const sinon = require('sinon');

const observeOutput = require('@serverless/test/observe-output');
const handleError = require('../../../../lib/cli/handle-error');
const isStandaloneExecutable = require('../../../../lib/utils/isStandaloneExecutable');
const ServerlessError = require('../../../../lib/serverless-error');
const proxyquire = require('proxyquire');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/lib/cli/handle-error.test.js', () => {
  it('should output environment information', async () => {
    const output = await observeOutput(() => handleError(new ServerlessError('Test error')));
    expect(output).to.have.string('Environment: ');
    expect(output).to.have.string('node');
    expect(output).to.have.string('framework');
    expect(output).to.have.string('plugin');
    expect(output).to.have.string('SDK');
  });

  it('should support `isUncaughtException` option', async () => {
    const processExitStub = sinon.stub(process, 'exit').returns();
    try {
      await handleError(new ServerlessError('Test error'), { isUncaughtException: true });
      expect(processExitStub.called).to.be.true;
    } finally {
      processExitStub.restore();
    }
  });

  if (isStandaloneExecutable) {
    it('should report standalone installation', async () => {
      const output = await observeOutput(() => handleError(new ServerlessError('Test error')));
      expect(output).to.have.string('(standalone)');
    });
  } else {
    it('should support `isLocallyInstalled` option', async () => {
      const output = await observeOutput(() =>
        handleError(new ServerlessError('Test error'), { isLocallyInstalled: false })
      );
      expect(output).to.not.have.string('(local)');
      const output2 = await observeOutput(() =>
        handleError(new ServerlessError('Test error'), { isLocallyInstalled: true })
      );
      expect(output2).to.have.string('(local)');
    });
  }

  it('should handle non-error objects', async () => {
    const output = await observeOutput(() => handleError(handleError('NON-ERROR')));
    expect(output).to.have.string('NON-ERROR');
  });

  describe('with mocked telemetry', () => {
    const generateTelemetryPayloadStub = sinon.stub().returns({});
    const storeTelemetryLocallyStub = sinon.stub();
    const sendTelemetryStub = sinon.stub();
    const resolveInputStub = sinon.stub().returns({ commandSchema: {} });

    const handleErrorWithMocks = proxyquire('../../../../lib/cli/handle-error', {
      './resolve-input': resolveInputStub,
      '../utils/telemetry/areDisabled': false,
      '../utils/telemetry/generatePayload': generateTelemetryPayloadStub,
      '../utils/telemetry/index': {
        send: sendTelemetryStub,
        storeLocally: storeTelemetryLocallyStub,
      },
    });

    beforeEach(() => {
      sinon.resetHistory();
    });

    it('should record telemetry only if `hasTelemetryBeenReported` is `false`', async () => {
      await handleErrorWithMocks(new ServerlessError('Test error', 'ERR_CODE'), {
        hasTelemetryBeenReported: false,
      });
      expect(generateTelemetryPayloadStub).to.be.calledOnce;
      expect(storeTelemetryLocallyStub).to.be.calledOnce;
      expect(sendTelemetryStub).to.be.calledOnce;
      expect(storeTelemetryLocallyStub.getCall(0).args[0]).to.deep.equal({
        outcome: 'failure',
        failureReason: {
          code: 'ERR_CODE',
          kind: 'user',
        },
      });
    });

    it('should add `location` to `failureReason` in telemetry if error code missing', async () => {
      await handleErrorWithMocks(new ServerlessError('Test error'), {
        hasTelemetryBeenReported: false,
      });
      expect(generateTelemetryPayloadStub).to.be.calledOnce;
      expect(storeTelemetryLocallyStub).to.be.calledOnce;
      expect(sendTelemetryStub).to.be.calledOnce;
      expect(storeTelemetryLocallyStub.getCall(0).args[0].failureReason).to.have.property(
        'location'
      );
    });

    it('should add `location` to `failureReason` in telemetry for non-user errors', async () => {
      await handleErrorWithMocks(new Error('Test error'), {
        hasTelemetryBeenReported: false,
      });
      expect(generateTelemetryPayloadStub).to.be.calledOnce;
      expect(storeTelemetryLocallyStub).to.be.calledOnce;
      expect(sendTelemetryStub).to.be.calledOnce;
      expect(storeTelemetryLocallyStub.getCall(0).args[0].failureReason).to.have.property(
        'location'
      );
    });

    it('should not record telemetry if `hasTelemetryBeenReported` is `true`', async () => {
      await handleErrorWithMocks(new ServerlessError('Test error'), {
        hasTelemetryBeenReported: true,
      });
      expect(generateTelemetryPayloadStub).not.to.be.called;
      expect(storeTelemetryLocallyStub).not.to.be.called;
      expect(sendTelemetryStub).not.to.be.called;
    });

    it('should not record telemetry if `hasTelemetryBeenReported` is not passed', async () => {
      await handleErrorWithMocks(new ServerlessError('Test error'));
      expect(generateTelemetryPayloadStub).not.to.be.called;
      expect(storeTelemetryLocallyStub).not.to.be.called;
      expect(sendTelemetryStub).not.to.be.called;
    });

    it('should not record telemetry if `commandSchema` was not resolved', async () => {
      // Ensure that `commandSchema` is not included in result of `resolveInput`
      resolveInputStub.returns({});

      await handleErrorWithMocks(new ServerlessError('Test error'), {
        hasTelemetryBeenReported: false,
      });
      expect(generateTelemetryPayloadStub).not.to.be.called;
      expect(storeTelemetryLocallyStub).not.to.be.called;
      expect(sendTelemetryStub).not.to.be.called;
    });
  });
});
