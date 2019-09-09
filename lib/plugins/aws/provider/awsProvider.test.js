'use strict';

/* eslint-disable no-unused-expressions */

const _ = require('lodash');
const BbPromise = require('bluebird');
const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const fs = require('fs');
const os = require('os');
const path = require('path');
const overrideEnv = require('process-utils/override-env');

const AwsProvider = require('./awsProvider');
const Serverless = require('../../../Serverless');
const { replaceEnv } = require('../../../../tests/utils/misc');
const { getTmpFilePath } = require('../../../../tests/utils/fs');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('AwsProvider', () => {
  let awsProvider;
  let serverless;
  let restoreEnv;
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };

  beforeEach(() => {
    ({ restoreEnv } = overrideEnv());
    serverless = new Serverless(options);
    serverless.cli = new serverless.classes.CLI();
    awsProvider = new AwsProvider(serverless, options);
  });
  afterEach(() => restoreEnv());

  describe('#getProviderName()', () => {
    it('should return the provider name', () => {
      expect(AwsProvider.getProviderName()).to.equal('aws');
    });
  });

  describe('#constructor()', () => {
    it('should set Serverless instance', () => {
      expect(typeof awsProvider.serverless).to.not.equal('undefined');
    });

    it('should set AWS instance', () => {
      expect(typeof awsProvider.sdk).to.not.equal('undefined');
    });

    it('should set the provider property', () => {
      expect(awsProvider.provider).to.equal(awsProvider);
    });

    it('should have no AWS logger', () => {
      expect(awsProvider.sdk.config.logger).to.be.null;
    });

    it('should set AWS logger', () => {
      process.env.SLS_DEBUG = 'true';
      const newAwsProvider = new AwsProvider(serverless, options);

      expect(typeof newAwsProvider.sdk.config.logger).to.not.equal('undefined');
    });

    it('should set AWS proxy', () => {
      process.env.proxy = 'http://a.b.c.d:n';
      const newAwsProvider = new AwsProvider(serverless, options);

      expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');
    });

    it('should set AWS timeout', () => {
      process.env.AWS_CLIENT_TIMEOUT = '120000';
      const newAwsProvider = new AwsProvider(serverless, options);

      expect(typeof newAwsProvider.sdk.config.httpOptions.timeout).to.not.equal('undefined');
    });

    describe('stage name validation', () => {
      const stages = ['myStage', 'my-stage', 'my_stage', "${opt:stage, 'prod'}"];
      stages.forEach(stage => {
        it(`should not throw an error before variable population
            even if http event is present and stage is ${stage}`, () => {
          const config = {
            stage,
          };
          serverless = new Serverless(config);

          const serverlessYml = {
            service: 'new-service',
            provider: {
              name: 'aws',
              stage,
            },
            functions: {
              first: {
                events: [
                  {
                    http: {
                      path: 'foo',
                      method: 'GET',
                    },
                  },
                ],
              },
            },
          };
          serverless.service = new serverless.classes.Service(serverless, serverlessYml);
          expect(() => new AwsProvider(serverless, config)).to.not.throw(Error);
        });
      });
    });

    describe('certificate authority - environment variable', () => {
      it('should set AWS ca single', () => {
        process.env.ca = '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----';
        const newAwsProvider = new AwsProvider(serverless, options);

        expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');
      });

      it('should set AWS ca single and proxy', () => {
        process.env.ca = '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----';
        process.env.proxy = 'http://a.b.c.d:n';

        const newAwsProvider = new AwsProvider(serverless, options);

        expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');
      });

      it('should set AWS ca multiple', () => {
        const certContents = '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----';
        process.env.ca = `${certContents},${certContents}`;
        const newAwsProvider = new AwsProvider(serverless, options);

        expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');
      });
    });

    describe('certificate authority - file', () => {
      const certContents = '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----';
      const tmpdir = os.tmpdir();
      let file1 = null;
      let file2 = null;

      beforeEach('Create CA Files and env vars', () => {
        file1 = path.join(tmpdir, 'ca1.txt');
        file2 = path.join(tmpdir, 'ca2.txt');
        fs.writeFileSync(file1, certContents);
        fs.writeFileSync(file2, certContents);
      });

      afterEach('CA File Cleanup', () => {
        // delete files
        fs.unlinkSync(file1);
        fs.unlinkSync(file2);
      });

      it('should set AWS cafile single', () => {
        process.env.cafile = file1;
        const newAwsProvider = new AwsProvider(serverless, options);

        expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');
      });

      it('should set AWS cafile multiple', () => {
        process.env.cafile = `${file1},${file2}`;
        const newAwsProvider = new AwsProvider(serverless, options);

        expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');
      });

      it('should set AWS ca and cafile', () => {
        process.env.ca = certContents;
        process.env.cafile = file1;
        const newAwsProvider = new AwsProvider(serverless, options);

        expect(typeof newAwsProvider.sdk.config.httpOptions.agent).to.not.equal('undefined');
      });
    });

    describe('deploymentBucket configuration', () => {
      it('should do nothing if not defined', () => {
        serverless.service.provider.deploymentBucket = undefined;

        const newAwsProvider = new AwsProvider(serverless, options);

        expect(newAwsProvider.serverless.service.provider.deploymentBucket).to.equal(undefined);
      });

      it('should do nothing if the value is a string', () => {
        serverless.service.provider.deploymentBucket = 'my.deployment.bucket';

        const newAwsProvider = new AwsProvider(serverless, options);

        expect(newAwsProvider.serverless.service.provider.deploymentBucket).to.equal(
          'my.deployment.bucket'
        );
      });

      it('should save a given object and use name from it', () => {
        const deploymentBucketObject = {
          name: 'my.deployment.bucket',
          serverSideEncryption: 'AES256',
        };
        serverless.service.provider.deploymentBucket = deploymentBucketObject;

        const newAwsProvider = new AwsProvider(serverless, options);

        expect(newAwsProvider.serverless.service.provider.deploymentBucket).to.equal(
          'my.deployment.bucket'
        );
        expect(newAwsProvider.serverless.service.provider.deploymentBucketObject).to.deep.equal(
          deploymentBucketObject
        );
      });

      it('should save a given object and nullify the name if one is not provided', () => {
        const deploymentBucketObject = {
          serverSideEncryption: 'AES256',
        };
        serverless.service.provider.deploymentBucket = deploymentBucketObject;

        const newAwsProvider = new AwsProvider(serverless, options);

        expect(newAwsProvider.serverless.service.provider.deploymentBucket).to.equal(null);
        expect(newAwsProvider.serverless.service.provider.deploymentBucketObject).to.deep.equal(
          deploymentBucketObject
        );
      });
    });
  });

  describe('#request()', () => {
    beforeEach(() => {
      const originalSetTimeout = setTimeout;
      sinon
        .stub(global, 'setTimeout')
        .callsFake((cb, timeout) => originalSetTimeout(cb, Math.min(timeout || 0, 10)));
    });

    afterEach(() => {
      global.setTimeout.restore();
    });

    it('should call correct aws method', () => {
      // mocking S3 for testing
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        putObject() {
          return {
            send: cb => cb(null, { called: true }),
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider.serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {
              profile: 'default',
            },
            regions: {},
          },
        },
      };

      return awsProvider.request('S3', 'putObject', {}).then(data => {
        expect(data.called).to.equal(true);
      });
    });

    it('should call correct aws method with a promise', () => {
      // mocking API Gateway for testing
      class FakeAPIGateway {
        constructor(credentials) {
          this.credentials = credentials;
        }

        getRestApis() {
          return {
            promise: () => BbPromise.resolve({ called: true }),
          };
        }
      }
      awsProvider.sdk = {
        APIGateway: FakeAPIGateway,
      };
      awsProvider.serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {
              profile: 'default',
            },
            regions: {},
          },
        },
      };

      return awsProvider.request('APIGateway', 'getRestApis', {}).then(data => {
        expect(data.called).to.equal(true);
      });
    });

    it('should request to the specified region if region in options set', () => {
      // mocking S3 for testing
      class FakeCloudForamtion {
        constructor(config) {
          this.config = config;
        }

        describeStacks() {
          return {
            send: cb =>
              cb(null, {
                region: this.config.region,
              }),
          };
        }
      }
      awsProvider.sdk = {
        CloudFormation: FakeCloudForamtion,
      };
      awsProvider.serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {
              profile: 'default',
            },
            regions: {},
          },
        },
      };
      expect(awsProvider.getCredentials().region).to.eql(options.region);

      return awsProvider
        .request(
          'CloudFormation',
          'describeStacks',
          { StackName: 'foo' },
          { region: 'ap-northeast-1' }
        )
        .then(data => {
          expect(data).to.eql({ region: 'ap-northeast-1' });
          // Requesting different region should not affect region in credentials
          expect(awsProvider.getCredentials().region).to.eql(options.region);
        });
    });

    it('should retry if error code is 429', done => {
      const error = {
        statusCode: 429,
        retryable: true,
        message: 'Testing retry',
      };
      const sendFake = {
        send: sinon.stub(),
      };
      sendFake.send.onFirstCall().yields(error);
      sendFake.send.yields(undefined, {});
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return sendFake;
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(data => {
          expect(data).to.exist;
          expect(sendFake.send).to.have.been.calledTwice;
          done();
        })
        .catch(done);
    });

    it('should retry if error code is 429 and retryable is set to false', done => {
      const error = {
        statusCode: 429,
        retryable: false,
        message: 'Testing retry',
      };
      const sendFake = {
        send: sinon.stub(),
      };
      sendFake.send.onFirstCall().yields(error);
      sendFake.send.yields(undefined, {});
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return sendFake;
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(data => {
          expect(data).to.exist;
          expect(sendFake.send).to.have.been.calledTwice;
          done();
        })
        .catch(done);
    });

    it('should not retry if error code is 403 and retryable is set to true', done => {
      const error = {
        statusCode: 403,
        retryable: true,
        message: 'Testing retry',
      };
      const sendFake = {
        send: sinon.stub(),
      };
      sendFake.send.onFirstCall().yields(error);
      sendFake.send.yields(undefined, {});
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return sendFake;
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch(() => {
          expect(sendFake.send).to.have.been.calledOnce;
          done();
        });
    });

    it('should reject errors', done => {
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
            send(cb) {
              cb(error);
            },
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch(() => done());
    });

    it('should use error message if it exists', done => {
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
            send(cb) {
              cb(awsErrorResponse);
            },
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch(err => {
          expect(err.message).to.eql(awsErrorResponse.message);
          done();
        })
        .catch(done);
    });

    it('should default to error code if error message is non-existent', done => {
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
            send(cb) {
              cb(awsErrorResponse);
            },
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch(err => {
          expect(err.message).to.eql(awsErrorResponse.code);
          done();
        })
        .catch(done);
    });

    it('should return ref to docs for missing credentials', done => {
      const error = {
        statusCode: 403,
        message: 'Missing credentials in config',
      };
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return {
            send(cb) {
              cb(error);
            },
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch(err => {
          expect(err.message).to.contain('in our docs here:');
          done();
        })
        .catch(done);
    });

    it('should not retry for missing credentials', done => {
      const error = {
        statusCode: 403,
        message: 'Missing credentials in config',
      };
      const sendFake = {
        send: sinon.stub().yields(error),
      };
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        error() {
          return sendFake;
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider
        .request('S3', 'error', {})
        .then(() => done('Should not succeed'))
        .catch(err => {
          expect(sendFake.send).to.have.been.calledOnce;
          expect(err.message).to.contain('in our docs here:');
          done();
        })
        .catch(done);
    });

    it('should enable S3 acceleration if CLI option is provided', () => {
      // mocking S3 for testing
      class FakeS3 {
        constructor(credentials) {
          this.credentials = credentials;
        }

        putObject() {
          return {
            send: cb => cb(null, { called: true }),
          };
        }
      }
      awsProvider.sdk = {
        S3: FakeS3,
      };
      awsProvider.serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {
              profile: 'default',
            },
            regions: {},
          },
        },
      };

      const enableS3TransferAccelerationStub = sinon
        .stub(awsProvider, 'enableS3TransferAcceleration')
        .resolves();

      awsProvider.options['aws-s3-accelerate'] = true;
      return awsProvider.request('S3', 'putObject', {}).then(() => {
        expect(enableS3TransferAccelerationStub.calledOnce).to.equal(true);
      });
    });

    describe('using the request cache', () => {
      it('should call correct aws method', () => {
        // mocking CF for testing
        class FakeCF {
          constructor(credentials) {
            this.credentials = credentials;
          }

          describeStacks() {
            return {
              send: cb => cb(null, { called: true }),
            };
          }
        }
        awsProvider.sdk = {
          CloudFormation: FakeCF,
        };
        awsProvider.serverless.service.environment = {
          vars: {},
          stages: {
            dev: {
              vars: {
                profile: 'default',
              },
              regions: {},
            },
          },
        };

        return awsProvider
          .request('CloudFormation', 'describeStacks', {}, { useCache: true })
          .then(data => {
            expect(data.called).to.equal(true);
          });
      });

      it('should request if same service, method and params but different region in option', () => {
        const expectedResult = { called: true };
        const sendStub = sinon.stub().yields(null, { called: true });
        const requestSpy = sinon.spy(awsProvider, 'request');
        class FakeCF {
          constructor(credentials) {
            this.credentials = credentials;
          }

          describeStacks() {
            return {
              send: sendStub,
            };
          }
        }
        awsProvider.sdk = {
          CloudFormation: FakeCF,
        };
        const executeRequestWithRegion = region =>
          awsProvider.request(
            'CloudFormation',
            'describeStacks',
            { StackName: 'same-stack' },
            {
              useCache: true,
              region,
            }
          );
        const requests = [];
        requests.push(BbPromise.try(() => executeRequestWithRegion('us-east-1')));
        requests.push(BbPromise.try(() => executeRequestWithRegion('ap-northeast-1')));

        return BbPromise.all(requests)
          .then(results => {
            expect(_.size(results, 2));
            _.forEach(results, result => {
              expect(result).to.deep.equal(expectedResult);
            });
            return expect(sendStub.callCount).to.equal(2);
          })
          .finally(() => {
            requestSpy.restore();
          });
      });

      it('should resolve to the same response with multiple parallel requests', () => {
        const expectedResult = { called: true };
        const sendStub = sinon.stub().yields(null, { called: true });
        const requestSpy = sinon.spy(awsProvider, 'request');
        class FakeCF {
          constructor(credentials) {
            this.credentials = credentials;
          }

          describeStacks() {
            return {
              send: sendStub,
            };
          }
        }
        awsProvider.sdk = {
          CloudFormation: FakeCF,
        };

        awsProvider.serverless.service.environment = {
          vars: {},
          stages: {
            dev: {
              vars: {
                profile: 'default',
              },
              regions: {},
            },
          },
        };

        const numTests = 1000;
        const executeRequest = () =>
          awsProvider.request('CloudFormation', 'describeStacks', {}, { useCache: true });
        const requests = [];
        for (let n = 0; n < numTests; n++) {
          requests.push(BbPromise.try(() => executeRequest()));
        }

        return BbPromise.all(requests)
          .then(results => {
            expect(_.size(results, numTests));
            _.forEach(results, result => {
              expect(result).to.deep.equal(expectedResult);
            });
            return BbPromise.join(
              expect(sendStub).to.have.been.calledOnce,
              expect(requestSpy).to.have.callCount(numTests)
            );
          })
          .finally(() => {
            requestSpy.restore();
          });
      });

      describe('STS tokens', () => {
        let newAwsProvider;
        let originalProviderProfile;
        let originalEnvironmentVariables;
        const relevantEnvironment = {
          AWS_SHARED_CREDENTIALS_FILE: getTmpFilePath('credentials'),
        };

        beforeEach(() => {
          originalProviderProfile = serverless.service.provider.profile;
          originalEnvironmentVariables = replaceEnv(relevantEnvironment);
          serverless.utils.writeFileSync(
            relevantEnvironment.AWS_SHARED_CREDENTIALS_FILE,
            '[default]\n' +
              'aws_access_key_id = 1111\n' +
              'aws_secret_access_key = 22222\n' +
              '\n' +
              '[async]\n' +
              'role_arn = arn:123\n' +
              'source_profile = default'
          );
          newAwsProvider = new AwsProvider(serverless, options);
        });

        afterEach(() => {
          replaceEnv(originalEnvironmentVariables);
          serverless.service.provider.profile = originalProviderProfile;
        });

        it('should retain reference to STS tokens when updated via SDK', () => {
          const expectedToken = '123';

          serverless.service.provider.profile = 'async';
          const startToken = newAwsProvider.getCredentials().credentials.sessionToken;
          expect(startToken).to.not.equal(expectedToken);

          class FakeCloudFormation {
            constructor(credentials) {
              // Not sure where the the SDK resolves the STS, so for the test it's here
              this.credentials = credentials;
              this.credentials.credentials.sessionToken = expectedToken;
            }

            describeStacks() {
              return {
                send: cb => cb(null, {}),
              };
            }
          }

          newAwsProvider.sdk = {
            CloudFormation: FakeCloudFormation,
          };

          return newAwsProvider
            .request(
              'CloudFormation',
              'describeStacks',
              { StackName: 'foo' },
              { region: 'ap-northeast-1' }
            )
            .then(() => {
              // STS token is resolved after SDK call
              const actualToken = newAwsProvider.getCredentials().credentials.sessionToken;
              expect(expectedToken).to.eql(actualToken);
            });
        });
      });
    });
  });

  describe('#getCredentials()', () => {
    const awsStub = sinon.stub().returns();
    const AwsProviderProxyquired = proxyquire('./awsProvider.js', {
      'aws-sdk': awsStub,
    });

    // add environment variables here if you want them cleared prior to your test and restored
    // after it has completed.  Any environment variable that might alter credentials loading
    // should be added here
    const relevantEnvironment = {
      AWS_ACCESS_KEY_ID: 'undefined',
      AWS_SECRET_ACCESS_KEY: 'undefined',
      AWS_SESSION_TOKEN: 'undefined',
      AWS_TESTSTAGE_ACCESS_KEY_ID: 'undefined',
      AWS_TESTSTAGE_SECRET_ACCESS_KEY: 'undefined',
      AWS_TESTSTAGE_SESSION_TOKEN: 'undefined',
      AWS_SHARED_CREDENTIALS_FILE: getTmpFilePath('credentials'),
      AWS_PROFILE: 'undefined',
      AWS_TESTSTAGE_PROFILE: 'undefined',
    };

    let newAwsProvider;
    const newOptions = {
      stage: 'teststage',
      region: 'testregion',
    };
    const fakeCredentials = {
      accessKeyId: 'AABBCCDDEEFF',
      secretAccessKey: '0123456789876543',
      sessionToken: '981237917391273918273918723987129837129873',
      roleArn: 'a:role:arn',
      sourceProfile: 'notDefaultTemporary',
    };

    let originalProviderCredentials;
    let originalProviderProfile;
    let originalEnvironmentVariables;

    beforeEach(() => {
      originalProviderCredentials = serverless.service.provider.credentials;
      originalProviderProfile = serverless.service.provider.profile;
      originalEnvironmentVariables = replaceEnv(relevantEnvironment);
      // make temporary credentials file
      serverless.utils.writeFileSync(
        relevantEnvironment.AWS_SHARED_CREDENTIALS_FILE,
        '[notDefault]\n' +
          `aws_access_key_id = ${fakeCredentials.accessKeyId}\n` +
          `aws_secret_access_key = ${fakeCredentials.secretAccessKey}\n` +
          '\n' +
          '[notDefaultTemporary]\n' +
          `aws_access_key_id = ${fakeCredentials.accessKeyId}\n` +
          `aws_secret_access_key = ${fakeCredentials.secretAccessKey}\n` +
          `aws_session_token = ${fakeCredentials.sessionToken}\n` +
          '\n' +
          '[notDefaultAsync]\n' +
          `role_arn = ${fakeCredentials.roleArn}\n` +
          `source_profile = ${fakeCredentials.sourceProfile}\n`
      );
      newAwsProvider = new AwsProviderProxyquired(serverless, newOptions);
    });

    afterEach(() => {
      replaceEnv(originalEnvironmentVariables);
      serverless.service.provider.profile = originalProviderProfile;
      serverless.service.provider.credentials = originalProviderCredentials;
    });

    it('should set region for credentials', () => {
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.region).to.equal(newOptions.region);
    });

    it('should not set credentials if credentials is an empty object', () => {
      serverless.service.provider.credentials = {};
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if credentials has undefined values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
      };
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if credentials has empty string values', () => {
      serverless.service.provider.credentials = {
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
      };
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should get credentials from provider declared credentials', () => {
      serverless.service.provider.credentials = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials).to.deep.eql(serverless.service.provider.credentials);
    });

    it('should load profile credentials from AWS_SHARED_CREDENTIALS_FILE', () => {
      serverless.service.provider.profile = 'notDefault';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal(serverless.service.provider.profile);
      expect(credentials.credentials.accessKeyId).to.equal(fakeCredentials.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(fakeCredentials.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(undefined);
    });

    it('should load async profiles properly', () => {
      serverless.service.provider.profile = 'notDefaultAsync';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.roleArn).to.equal(fakeCredentials.roleArn);
    });

    it('should throw an error if a non-existent profile is set', () => {
      serverless.service.provider.profile = 'not-a-defined-profile';
      expect(() => {
        newAwsProvider.getCredentials();
      }).to.throw(Error);
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if profile is not set', () => {
      serverless.service.provider.profile = undefined;
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should not set credentials if empty profile is set', () => {
      serverless.service.provider.profile = '';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials).to.eql({ region: newOptions.region });
    });

    it('should get credentials from provider declared temporary profile', () => {
      serverless.service.provider.profile = 'notDefaultTemporary';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal(serverless.service.provider.profile);
      expect(credentials.credentials.accessKeyId).to.equal(fakeCredentials.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(fakeCredentials.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(fakeCredentials.sessionToken);
    });

    it('should get credentials from environment declared for-all-stages credentials', () => {
      const testVal = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      process.env.AWS_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_SESSION_TOKEN = testVal.sessionToken;

      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.accessKeyId).to.equal(testVal.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(testVal.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(testVal.sessionToken);
    });

    it('should get credentials from environment declared stage specific credentials', () => {
      const testVal = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      process.env.AWS_TESTSTAGE_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_TESTSTAGE_SESSION_TOKEN = testVal.sessionToken;

      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.accessKeyId).to.equal(testVal.accessKeyId);
      expect(credentials.credentials.secretAccessKey).to.equal(testVal.secretAccessKey);
      expect(credentials.credentials.sessionToken).to.equal(testVal.sessionToken);
    });

    it('should get credentials from environment declared for-all-stages profile', () => {
      process.env.AWS_PROFILE = 'notDefault';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials from environment declared stage-specific profile', () => {
      process.env.AWS_TESTSTAGE_PROFILE = 'notDefault';
      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials when profile is provied via --aws-profile option', () => {
      process.env.AWS_PROFILE = 'notDefaultTemporary';
      newAwsProvider.options['aws-profile'] = 'notDefault';

      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials when profile is provied via --aws-profile option even if profile is defined in serverless.yml', () => {
      // eslint-disable-line max-len
      process.env.AWS_PROFILE = 'notDefaultTemporary';
      newAwsProvider.options['aws-profile'] = 'notDefault';

      serverless.service.provider.profile = 'notDefaultTemporary2';

      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should get credentials when profile is provied via process.env.AWS_PROFILE even if profile is defined in serverless.yml', () => {
      // eslint-disable-line max-len
      process.env.AWS_PROFILE = 'notDefault';

      serverless.service.provider.profile = 'notDefaultTemporary';

      const credentials = newAwsProvider.getCredentials();
      expect(credentials.credentials.profile).to.equal('notDefault');
    });

    it('should set the signatureVersion to v4 if the serverSideEncryption is aws:kms', () => {
      newAwsProvider.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'aws:kms',
      };

      const credentials = newAwsProvider.getCredentials();
      expect(credentials.signatureVersion).to.equal('v4');
    });
  });

  describe('values', () => {
    const obj = {
      a: 'b',
      c: {
        d: 'e',
        f: {
          g: 'h',
        },
      },
    };
    const paths = [['a'], ['c', 'd'], ['c', 'f', 'g']];
    const getExpected = [
      { path: paths[0], value: obj.a },
      { path: paths[1], value: obj.c.d },
      { path: paths[2], value: obj.c.f.g },
    ];
    describe('#getValues', () => {
      it('should return an array of values given paths to them', () => {
        expect(awsProvider.getValues(obj, paths)).to.eql(getExpected);
      });
    });
    describe('#firstValue', () => {
      it("should ignore entries without a 'value' attribute", () => {
        const input = _.cloneDeep(getExpected);
        delete input[0].value;
        delete input[2].value;
        expect(awsProvider.firstValue(input)).to.eql(getExpected[1]);
      });
      it("should ignore entries with an undefined 'value' attribute", () => {
        const input = _.cloneDeep(getExpected);
        input[0].value = undefined;
        input[2].value = undefined;
        expect(awsProvider.firstValue(input)).to.eql(getExpected[1]);
      });
      it('should return the first value', () => {
        expect(awsProvider.firstValue(getExpected)).to.equal(getExpected[0]);
      });
      it('should return the middle value', () => {
        const input = _.cloneDeep(getExpected);
        delete input[0].value;
        delete input[2].value;
        expect(awsProvider.firstValue(input)).to.equal(input[1]);
      });
      it('should return the last value', () => {
        const input = _.cloneDeep(getExpected);
        delete input[0].value;
        delete input[1].value;
        expect(awsProvider.firstValue(input)).to.equal(input[2]);
      });
      it('should return the last object if none have valid values', () => {
        const input = _.cloneDeep(getExpected);
        delete input[0].value;
        delete input[1].value;
        delete input[2].value;
        expect(awsProvider.firstValue(input)).to.equal(input[2]);
      });
    });
  });

  describe('#getRegion()', () => {
    let newAwsProvider;

    it('should prefer options over config or provider', () => {
      const newOptions = {
        region: 'optionsRegion',
      };
      const config = {
        region: 'configRegion',
      };
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal(newOptions.region);
    });

    it('should prefer config over provider in lieu of options', () => {
      const newOptions = {};
      const config = {
        region: 'configRegion',
      };
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal(config.region);
    });

    it('should use provider in lieu of options and config', () => {
      const newOptions = {};
      const config = {};
      serverless = new Serverless(config);
      serverless.service.provider.region = 'providerRegion';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal(serverless.service.provider.region);
    });

    it('should use the default us-east-1 in lieu of options, config, and provider', () => {
      const newOptions = {};
      const config = {};
      serverless = new Serverless(config);
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getRegion()).to.equal('us-east-1');
    });
  });

  describe('#getProfile()', () => {
    let newAwsProvider;

    it('should prefer options over config or provider', () => {
      const newOptions = {
        profile: 'optionsProfile',
      };
      const config = {
        profile: 'configProfile',
      };
      serverless = new Serverless(config);
      serverless.service.provider.profile = 'providerProfile';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getProfile()).to.equal(newOptions.profile);
    });

    it('should prefer config over provider in lieu of options', () => {
      const newOptions = {};
      const config = {
        profile: 'configProfile',
      };
      serverless = new Serverless(config);
      serverless.service.provider.profile = 'providerProfile';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getProfile()).to.equal(config.profile);
    });

    it('should use provider in lieu of options and config', () => {
      const newOptions = {};
      const config = {};
      serverless = new Serverless(config);
      serverless.service.provider.profile = 'providerProfile';
      newAwsProvider = new AwsProvider(serverless, newOptions);

      expect(newAwsProvider.getProfile()).to.equal(serverless.service.provider.profile);
    });
  });

  describe('#getServerlessDeploymentBucketName()', () => {
    it('should return the name of the serverless deployment bucket', () => {
      const describeStackResourcesStub = sinon.stub(awsProvider, 'request').resolves({
        StackResourceDetail: {
          PhysicalResourceId: 'serverlessDeploymentBucketName',
        },
      });

      return awsProvider.getServerlessDeploymentBucketName().then(bucketName => {
        expect(bucketName).to.equal('serverlessDeploymentBucketName');
        expect(describeStackResourcesStub.calledOnce).to.be.equal(true);
        expect(
          describeStackResourcesStub.calledWithExactly('CloudFormation', 'describeStackResource', {
            StackName: awsProvider.naming.getStackName(),
            LogicalResourceId: awsProvider.naming.getDeploymentBucketLogicalId(),
          })
        ).to.be.equal(true);
        awsProvider.request.restore();
      });
    });

    it('should return the name of the custom deployment bucket', () => {
      awsProvider.serverless.service.provider.deploymentBucket = 'custom-bucket';

      const describeStackResourcesStub = sinon.stub(awsProvider, 'request').resolves({
        StackResourceDetail: {
          PhysicalResourceId: 'serverlessDeploymentBucketName',
        },
      });

      return awsProvider.getServerlessDeploymentBucketName().then(bucketName => {
        expect(describeStackResourcesStub.called).to.be.equal(false);
        expect(bucketName).to.equal('custom-bucket');
        awsProvider.request.restore();
      });
    });
  });

  describe('#getDeploymentPrefix()', () => {
    it('should return custom deployment prefix if defined', () => {
      serverless.service.provider.deploymentPrefix = 'providerPrefix';

      expect(awsProvider.getDeploymentPrefix()).to.equal(
        serverless.service.provider.deploymentPrefix
      );
    });

    it('should use the default serverless if not defined', () => {
      serverless.service.provider.deploymentPrefix = undefined;

      expect(awsProvider.getDeploymentPrefix()).to.equal('serverless');
    });
  });

  describe('#getStage()', () => {
    it('should prefer options over config or provider', () => {
      const newOptions = {
        stage: 'optionsStage',
      };
      const config = {
        stage: 'configStage',
      };
      serverless = new Serverless(config);
      serverless.service.provider.stage = 'providerStage';
      awsProvider = new AwsProvider(serverless, newOptions);

      expect(awsProvider.getStage()).to.equal(newOptions.stage);
    });

    it('should prefer config over provider in lieu of options', () => {
      const newOptions = {};
      const config = {
        stage: 'configStage',
      };
      serverless = new Serverless(config);
      serverless.service.provider.stage = 'providerStage';
      awsProvider = new AwsProvider(serverless, newOptions);

      expect(awsProvider.getStage()).to.equal(config.stage);
    });

    it('should use provider in lieu of options and config', () => {
      const newOptions = {};
      const config = {};
      serverless = new Serverless(config);
      serverless.service.provider.stage = 'providerStage';
      awsProvider = new AwsProvider(serverless, newOptions);

      expect(awsProvider.getStage()).to.equal(serverless.service.provider.stage);
    });

    it('should use the default dev in lieu of options, config, and provider', () => {
      const newOptions = {};
      const config = {};
      serverless = new Serverless(config);
      awsProvider = new AwsProvider(serverless, newOptions);

      expect(awsProvider.getStage()).to.equal('dev');
    });
  });

  describe('#getAccountInfo()', () => {
    it('should return the AWS account id and partition', () => {
      const accountId = '12345678';
      const partition = 'aws';

      const stsGetCallerIdentityStub = sinon.stub(awsProvider, 'request').resolves({
        ResponseMetadata: { RequestId: '12345678-1234-1234-1234-123456789012' },
        UserId: 'ABCDEFGHIJKLMNOPQRSTU:VWXYZ',
        Account: accountId,
        Arn: 'arn:aws:sts::123456789012:assumed-role/ROLE-NAME/VWXYZ',
      });

      return awsProvider.getAccountInfo().then(result => {
        expect(stsGetCallerIdentityStub.calledOnce).to.equal(true);
        expect(result.accountId).to.equal(accountId);
        expect(result.partition).to.equal(partition);
        awsProvider.request.restore();
      });
    });
  });

  describe('#getAccountId()', () => {
    it('should return the AWS account id', () => {
      const accountId = '12345678';

      const stsGetCallerIdentityStub = sinon.stub(awsProvider, 'request').resolves({
        ResponseMetadata: { RequestId: '12345678-1234-1234-1234-123456789012' },
        UserId: 'ABCDEFGHIJKLMNOPQRSTU:VWXYZ',
        Account: accountId,
        Arn: 'arn:aws:sts::123456789012:assumed-role/ROLE-NAME/VWXYZ',
      });

      return awsProvider.getAccountId().then(result => {
        expect(stsGetCallerIdentityStub.calledOnce).to.equal(true);
        expect(result).to.equal(accountId);
        awsProvider.request.restore();
      });
    });
  });

  describe('#isS3TransferAccelerationEnabled()', () => {
    it('should return false by default', () => {
      awsProvider.options['aws-s3-accelerate'] = undefined;
      return expect(awsProvider.isS3TransferAccelerationEnabled()).to.equal(false);
    });
    it('should return true when CLI option is provided', () => {
      awsProvider.options['aws-s3-accelerate'] = true;
      return expect(awsProvider.isS3TransferAccelerationEnabled()).to.equal(true);
    });
  });

  describe('#canUseS3TransferAcceleration()', () => {
    it('should return false by default with any input', () => {
      awsProvider.options['aws-s3-accelerate'] = undefined;
      return expect(
        awsProvider.canUseS3TransferAcceleration('lambda', 'updateFunctionCode')
      ).to.equal(false);
    });
    it('should return false by default with S3.upload too', () => {
      awsProvider.options['aws-s3-accelerate'] = undefined;
      return expect(awsProvider.canUseS3TransferAcceleration('S3', 'upload')).to.equal(false);
    });
    it('should return false by default with S3.putObject too', () => {
      awsProvider.options['aws-s3-accelerate'] = undefined;
      return expect(awsProvider.canUseS3TransferAcceleration('S3', 'putObject')).to.equal(false);
    });
    it('should return false when CLI option is provided but not an S3 upload', () => {
      awsProvider.options['aws-s3-accelerate'] = true;
      return expect(
        awsProvider.canUseS3TransferAcceleration('lambda', 'updateFunctionCode')
      ).to.equal(false);
    });
    it('should return true when CLI option is provided for S3.upload', () => {
      awsProvider.options['aws-s3-accelerate'] = true;
      return expect(awsProvider.canUseS3TransferAcceleration('S3', 'upload')).to.equal(true);
    });
    it('should return true when CLI option is provided for S3.putObject', () => {
      awsProvider.options['aws-s3-accelerate'] = true;
      return expect(awsProvider.canUseS3TransferAcceleration('S3', 'putObject')).to.equal(true);
    });
  });

  describe('#enableS3TransferAcceleration()', () => {
    it('should update the given credentials object to enable S3 acceleration', () => {
      const credentials = {};
      awsProvider.enableS3TransferAcceleration(credentials);
      return expect(credentials.useAccelerateEndpoint).to.equal(true);
    });
  });

  describe('#disableTransferAccelerationForCurrentDeploy()', () => {
    it('should remove the corresponding option for the current deploy', () => {
      awsProvider.options['aws-s3-accelerate'] = true;
      awsProvider.disableTransferAccelerationForCurrentDeploy();
      return expect(awsProvider.options['aws-s3-accelerate']).to.be.undefined;
    });
  });
});
