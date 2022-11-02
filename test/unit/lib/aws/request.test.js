'use strict';

const sinon = require('sinon');
const chai = require('chai');
const proxyquire = require('proxyquire');
const overrideEnv = require('process-utils/override-env');

const expect = chai.expect;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

describe('#request', () => {
  describe('Credentials support', () => {
    // awsRequest supports credentials from two sources:
    // - an AWS credentials object passed as part of params in the call
    // - environment variable read by the AWS SDK

    // Ensure we control the process env variable so that no credentials
    // are available by default
    let rEnv;
    beforeEach(() => {
      const { restoreEnv } = overrideEnv();
      rEnv = restoreEnv;
    });

    afterEach(() => {
      rEnv();
    });

    it('should produce a meaningful error when no supported credentials are provided', async () => {
      const awsRequest = require('../../../../lib/aws/request');
      return expect(
        awsRequest(
          {
            name: 'S3',
          },
          'putObject',
          {
            Bucket: 'test-bucket',
            Key: 'test-key',
          }
        )
      ).to.be.eventually.rejected.and.have.property('code', 'AWS_CREDENTIALS_NOT_FOUND');
    });

    it('should support passing params without credentials', async () => {
      const awsRequest = require('../../../../lib/aws/request');
      return expect(
        awsRequest(
          {
            name: 'S3',
            params: { isS3TransferAccelerationEnabled: true },
          },
          'putObject',
          {
            Bucket: 'test-bucket',
            Key: 'test-key',
          }
        )
      ).to.be.rejectedWith('AWS provider credentials not found.');
    });
  });

  it('should invoke expected AWS SDK methods', async () => {
    class FakeS3 {
      putObject() {
        return {
          promise: async () => {
            return { called: true };
          },
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });
    const res = await awsRequest({ name: 'S3' }, 'putObject');
    expect(res.called).to.equal(true);
  });

  it('should support string for service argument', async () => {
    class FakeS3 {
      putObject() {
        return {
          promise: async () => {
            return { called: true };
          },
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });
    const res = await awsRequest('S3', 'putObject', {});
    return expect(res.called).to.equal(true);
  });

  it('should handle subclasses', async () => {
    class DocumentClient {
      put() {
        return {
          promise: () => {
            return { called: true };
          },
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { DynamoDB: { DocumentClient } },
    });
    const res = await awsRequest({ name: 'DynamoDB.DocumentClient' }, 'put', {});
    return expect(res.called).to.equal(true);
  });

  it('should request to the specified region if region in options set', async () => {
    class FakeCloudFormation {
      constructor(config) {
        this.config = config;
      }
      describeStacks() {
        return {
          promise: () =>
            Promise.resolve({
              region: this.config.region,
            }),
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { CloudFormation: FakeCloudFormation },
    });
    const res = await awsRequest(
      { name: 'CloudFormation', params: { credentials: {}, region: 'ap-northeast-1' } },
      'describeStacks',
      { StackName: 'foo' }
    );
    return expect(res).to.eql({ region: 'ap-northeast-1' });
  });

  describe('Retries', () => {
    it('should retry on retryable errors (429)', async () => {
      const error = {
        statusCode: 429,
        retryable: true,
        message: 'Testing retry',
      };
      const sendFake = {
        promise: sinon.stub(),
      };
      sendFake.promise.onCall(0).returns(Promise.reject(error));
      sendFake.promise.onCall(1).returns(Promise.resolve({ data: {} }));
      class FakeS3 {
        error() {
          return sendFake;
        }
      }
      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { S3: FakeS3 },
        'timers-ext/promise/sleep': () => Promise.resolve(),
      });
      const res = await awsRequest({ name: 'S3' }, 'error');
      expect(sendFake.promise).to.have.been.calledTwice;
      expect(res).to.exist;
    });

    it('should retry if error code is 429 and retryable is set to false', async () => {
      const error = {
        statusCode: 429,
        retryable: false,
        message: 'Testing retry',
      };
      const sendFake = {
        promise: sinon.stub(),
      };
      sendFake.promise.onCall(0).returns(Promise.reject(error));
      sendFake.promise.onCall(1).returns(Promise.resolve({}));
      class FakeS3 {
        error() {
          return sendFake;
        }
      }
      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { S3: FakeS3 },
        'timers-ext/promise/sleep': () => Promise.resolve(),
      });
      const res = await awsRequest({ name: 'S3' }, 'error');
      expect(res).to.exist;
      expect(sendFake.promise).to.have.been.calledTwice;
    });

    it('should not retry if status code is 403 and retryable is set to true', async () => {
      const error = {
        providerError: {
          statusCode: 403,
          retryable: true,
          code: 'retry',
          message: 'Testing retry',
        },
      };
      const sendFake = {
        promise: sinon.stub(),
      };
      sendFake.promise.onFirstCall().rejects(error);
      sendFake.promise.onSecondCall().resolves({});
      class FakeS3 {
        error() {
          return sendFake;
        }
      }
      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { S3: FakeS3 },
      });
      expect(awsRequest({ name: 'S3' }, 'error')).to.be.rejected;
      return expect(sendFake.promise).to.have.been.calledOnce;
    });

    it('should not retry if error code is ExpiredTokenException and retryable is set to true', async () => {
      const error = {
        providerError: {
          statusCode: 400,
          retryable: true,
          code: 'ExpiredTokenException',
          message: 'Testing retry',
        },
      };
      const sendFake = {
        promise: sinon.stub(),
      };
      sendFake.promise.onFirstCall().rejects(error);
      sendFake.promise.onSecondCall().resolves({});
      class FakeS3 {
        error() {
          return sendFake;
        }
      }
      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { S3: FakeS3 },
      });
      expect(awsRequest({ name: 'S3' }, 'error')).to.be.rejected;
      return expect(sendFake.promise).to.have.been.calledOnce;
    });

    it('should expose non-retryable errors', async () => {
      const error = {
        statusCode: 500,
        message: 'Some error message',
        code: 'SomeError',
      };
      class FakeS3 {
        test() {
          return {
            promise: async () => {
              throw error;
            },
          };
        }
      }
      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { S3: FakeS3 },
      });
      await expect(awsRequest({ name: 'S3' }, 'test')).to.eventually.be.rejected.and.have.property(
        'code',
        'AWS_S3_TEST_SOME_ERROR'
      );
    });

    it('should handle numeric error codes', async () => {
      const error = {
        statusCode: 500,
        message: 'Some error message',
        code: 500,
      };
      class FakeS3 {
        test() {
          return {
            promise: async () => {
              throw error;
            },
          };
        }
      }
      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { S3: FakeS3 },
      });
      await expect(awsRequest({ name: 'S3' }, 'test')).to.eventually.be.rejected.and.have.property(
        'code',
        'AWS_S3_TEST_HTTP_500_ERROR'
      );
    });
  });

  it('should expose original error message in thrown error message', () => {
    const awsErrorResponse = {
      message: 'Something went wrong...',
      code: 'Forbidden',
      region: null,
      time: '2019-01-24T00:29:01.780Z',
      requestId: 'DAF12C1111A62C6',
      extendedRequestId: '1OnSExiLCOsKrsdjjyds31w=',
      statusCode: 403,
      retryable: false,
      retryDelay: 13.433158364430508,
    };
    class FakeS3 {
      error() {
        return {
          promise: () => Promise.reject(awsErrorResponse),
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });
    return expect(awsRequest({ name: 'S3' }, 'error')).to.be.rejectedWith(awsErrorResponse.message);
  });

  it('should default to error code if error message is non-existent', () => {
    const awsErrorResponse = {
      message: null,
      code: 'Forbidden',
      region: null,
      time: '2019-01-24T00:29:01.780Z',
      requestId: 'DAF12C1111A62C6',
      extendedRequestId: '1OnSExiLCOsKrsdjjyds31w=',
      statusCode: 403,
      retryable: false,
      retryDelay: 13.433158364430508,
    };
    class FakeS3 {
      error() {
        return {
          promise: () => Promise.reject(awsErrorResponse),
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });
    return expect(awsRequest({ name: 'S3' }, 'error')).to.be.rejectedWith(awsErrorResponse.code);
  });

  it('should enable S3 acceleration if "--aws-s3-accelerate" CLI option is provided', async () => {
    // mocking S3 for testing
    class FakeS3 {
      constructor(params) {
        this.useAccelerateEndpoint = params.useAccelerateEndpoint;
      }
      putObject() {
        return {
          promise: () => Promise.resolve(this),
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });
    const service = await awsRequest(
      { name: 'S3', params: { isS3TransferAccelerationEnabled: true } },
      'putObject',
      {}
    );
    return expect(service.useAccelerateEndpoint).to.be.true;
  });

  describe('Caching through memoize', () => {
    it('should reuse the result if arguments are the same', async () => {
      // mocking CF for testing
      const expectedResult = { called: true };
      const promiseStub = sinon.stub().returns(Promise.resolve({ called: true }));
      class FakeCF {
        describeStacks() {
          return {
            promise: promiseStub,
          };
        }
      }
      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { CloudFormation: FakeCF },
      });
      const numTests = 100;
      const executeRequest = () =>
        awsRequest.memoized(
          { name: 'CloudFormation', params: { credentials: {}, useCache: true } },
          'describeStacks',
          {}
        );
      const requests = [];
      for (let n = 0; n < numTests; n++) {
        requests.push(executeRequest());
      }
      return Promise.all(requests).then((results) => {
        expect(Object.keys(results).length).to.equal(numTests);
        results.forEach((result) => {
          expect(result).to.deep.equal(expectedResult);
        });
        expect(promiseStub).to.have.been.calledOnce;
      });
    });

    it('should not reuse the result if the region change', async () => {
      const expectedResult = { called: true };
      const promiseStub = sinon.stub().returns(Promise.resolve({ called: true }));
      class FakeCF {
        constructor(credentials) {
          this.credentials = credentials;
        }

        describeStacks() {
          return {
            promise: promiseStub,
          };
        }
      }

      const awsRequest = proxyquire('../../../../lib/aws/request', {
        'aws-sdk': { CloudFormation: FakeCF },
      });

      const executeRequestWithRegion = (region) =>
        awsRequest(
          { name: 'CloudFormation', params: { region, credentials: {}, useCache: true } },
          'describeStacks',
          { StackName: 'same-stack' }
        );
      const requests = [];
      requests.push(executeRequestWithRegion('us-east-1'));
      requests.push(executeRequestWithRegion('ap-northeast-1'));

      return Promise.all(requests).then((results) => {
        expect(Object.keys(results).length).to.equal(2);
        results.forEach((result) => {
          expect(result).to.deep.equal(expectedResult);
        });
        return expect(promiseStub.callCount).to.equal(2);
      });
    });
  });
});
