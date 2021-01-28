'use strict';

const sinon = require('sinon');
const chai = require('chai');
const proxyquire = require('proxyquire');

const expect = chai.expect;

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

describe('#request', () => {
  it('should enable aws logging when debug log is enabled', () => {
    const configStub = sinon.stub();
    // enable logging for test
    process.env.SLS_DEBUG = true;
    // importing should enable aws logging
    proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { config: configStub },
    });
    expect(configStub.logger).not.to.be.null;
    expect(configStub.logger).not.to.be.undefined;
    // disable logging for rest of the tests
    process.env.SLS_DEBUG = false;
  });

  it('should trigger the expected AWS SDK invokation', () => {
    class FakeS3 {
      constructor(credentials) {
        this.credentials = credentials;
      }

      putObject() {
        return {
          promise: () => Promise.resolve({ called: true }),
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });
    return awsRequest({ name: 'S3', params: { credentials: {} } }, 'putObject', {}).then((data) => {
      expect(data.called).to.equal(true);
    });
  });

  it('should support string for service argument', () => {
    class FakeS3 {
      constructor(credentials) {
        this.credentials = credentials;
      }

      putObject() {
        return {
          promise: () => Promise.resolve({ called: true }),
        };
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });
    return awsRequest('S3', 'putObject', {}).then((data) => {
      expect(data.called).to.equal(true);
    });
  });

  it('should handle subclasses', () => {
    class DocumentClient {
      constructor(credentials) {
        this.credentials = credentials;
      }

      put() {
        return {
          promise: () => Promise.resolve({ called: true }),
        };
      }
    }

    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { DynamoDB: { DocumentClient } },
    });

    return awsRequest(
      { name: 'DynamoDB.DocumentClient', params: { credentials: {} } },
      'put',
      {}
    ).then((data) => {
      expect(data.called).to.equal(true);
    });
  });

  it('should request to the specified region if region in options set', () => {
    // mocking CloudFormation for testing
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
    return awsRequest(
      { name: 'CloudFormation', params: { credentials: {}, region: 'ap-northeast-1' } },
      'describeStacks',
      { StackName: 'foo' }
    ).then((data) => {
      expect(data).to.eql({ region: 'ap-northeast-1' });
    });
  });

  it('should retry on retryable errors (429)', (done) => {
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
      constructor(credentials) {
        this.credentials = credentials;
      }

      error() {
        return sendFake;
      }
    }

    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
      'timers-ext/promise/sleep': () => Promise.resolve(),
    });

    awsRequest({ name: 'S3', params: { credentials: {} } }, 'error', {})
      .then((data) => {
        expect(sendFake.promise).to.have.been.calledTwice;
        expect(data).to.exist;
        done();
      })
      .catch(done);
  });

  it('should retry if error code is 429 and retryable is set to false', (done) => {
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
      constructor(credentials) {
        this.credentials = credentials;
      }

      error() {
        return sendFake;
      }
    }

    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
      'timers-ext/promise/sleep': () => Promise.resolve(),
    });

    awsRequest({ name: 'S3', params: { credentials: {} } }, 'error')
      .then((data) => {
        expect(data).to.exist;
        expect(sendFake.promise).to.have.been.calledTwice;
        done();
      })
      .catch(done);
  });

  it('should not retry if error code is 403 and retryable is set to true', (done) => {
    const error = {
      providerError: {
        statusCode: 403,
        retryable: true,
        message: 'Testing retry',
      },
    };
    const sendFake = {
      promise: sinon.stub(),
    };
    sendFake.promise.onFirstCall().rejects(error);
    sendFake.promise.onSecondCall().resolves({});
    class FakeS3 {
      constructor(credentials) {
        this.credentials = credentials;
      }

      error() {
        return sendFake;
      }
    }
    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });

    awsRequest({ name: 'S3', params: { credentials: {} } }, 'error', {})
      .then(() => done('Should not succeed'))
      .catch(() => {
        expect(sendFake.promise).to.have.been.calledOnce;
        done();
      });
  });

  it('should expose non-retryable errors', (done) => {
    const error = {
      statusCode: 500,
      message: 'Some error message',
    };
    class FakeS3 {
      constructor(credentials) {
        this.credentials = credentials;
      }

      error() {
        return {
          promise: () => Promise.reject(error),
        };
      }
    }

    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });

    awsRequest({ name: 'S3', params: { credentials: {} } }, 'error', {})
      .then(() => done('Should not succeed'))
      .catch(() => done());
  });

  it('should expose original error message in thrown error message', (done) => {
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
      constructor(credentials) {
        this.credentials = credentials;
      }

      error() {
        return {
          promise: () => Promise.reject(awsErrorResponse),
        };
      }
    }

    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });

    awsRequest({ name: 'S3', params: { credentials: {} } }, 'error', {})
      .then(() => done('Should not succeed'))
      .catch((err) => {
        expect(err.message).to.equal(awsErrorResponse.message);
        done();
      })
      .catch(done);
  });

  it('should default to error code if error message is non-existent', (done) => {
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
      constructor(credentials) {
        this.credentials = credentials;
      }

      error() {
        return {
          promise: () => Promise.reject(awsErrorResponse),
        };
      }
    }

    const awsRequest = proxyquire('../../../../lib/aws/request', {
      'aws-sdk': { S3: FakeS3 },
    });

    awsRequest({ name: 'S3', params: { credentials: {} } }, 'error', {})
      .then(() => done('Should not succeed'))
      .catch((err) => {
        expect(err.message).to.equal(awsErrorResponse.code);
        done();
      })
      .catch(done);
  });

  it('should enable S3 acceleration if "--aws-s3-accelerate" CLI option is provided', () => {
    // mocking S3 for testing
    class FakeS3 {
      constructor(params) {
        this.credentials = params.credentials;
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

    return awsRequest(
      { name: 'S3', params: { credentials: {}, isS3TransferAccelerationEnabled: true } },
      'putObject',
      {}
    ).then((service) => {
      // those credentials are passed to the service constructor
      expect(service.useAccelerateEndpoint).to.be.true;
    });
  });

  describe('Caching through memoize', () => {
    it('should reuse the result if arguments are the same', (done) => {
      // mocking CF for testing
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

      Promise.all(requests).then((results) => {
        expect(Object.keys(results).length).to.equal(numTests);
        results.forEach((result) => {
          expect(result).to.deep.equal(expectedResult);
        });
        expect(promiseStub).to.have.been.calledOnce;
        done();
      });
    });

    it('should not reuse the result if the region change', () => {
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
