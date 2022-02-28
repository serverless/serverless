'use strict';

const chai = require('chai');
const sinon = require('sinon');

const observeOutput = require('@serverless/test/observe-output');
const handleError = require('../../../../lib/cli/handle-error');
const isStandaloneExecutable = require('../../../../lib/utils/is-standalone-executable');
const ServerlessError = require('../../../../lib/serverless-error');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('test/unit/lib/cli/handle-error.test.js', () => {
  it('should output error', async () => {
    const output = await observeOutput(() => handleError(new ServerlessError('Test error')));
    expect(output).to.have.string('Test error');
  });

  if (isStandaloneExecutable) {
    it('should report standalone installation', async () => {
      const output = await observeOutput(() => handleError(new ServerlessError('Test error')));
      expect(output).to.have.string('(standalone)');
    });
  }

  it('should handle non-error objects', async () => {
    const output = await observeOutput(() => handleError(handleError('NON-ERROR')));
    expect(output).to.have.string('NON-ERROR');
  });

  describe('with mocked telemetry', () => {
    beforeEach(() => {
      sinon.resetHistory();
    });

    it('should add `location` to `failureReason` in telemetry if error code missing', async () => {
      const {
        telemetryData: { failureReason },
      } = await handleError(new ServerlessError('Test error'), {});
      expect(failureReason).to.have.property('location');
    });

    it('should add `location` to `failureReason` in telemetry for non-user errors', async () => {
      const {
        telemetryData: { failureReason },
      } = await handleError(new Error('Test error'), {});
      expect(failureReason).to.have.property('location');
    });
  });
});
