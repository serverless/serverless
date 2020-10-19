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
const { replaceEnv } = require('../../../../test/utils/misc');
const { getTmpFilePath } = require('../../../../test/utils/fs');

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
      expect(awsProvider.sdk.config.logger == null).to.be.true;
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

    it('should handle subclasses', () => {
      class DocumentClient {
        constructor(credentials) {
          this.credentials = credentials;
        }

        put() {
          return {
            send: cb => cb(null, { called: true }),
          };
        }
      }

      awsProvider.sdk = {
        DynamoDB: {
          DocumentClient,
        },
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

      return awsProvider.request('DynamoDB.DocumentClient', 'put', {}).then(data => {
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

      return awsProvider
        .request(
          'CloudFormation',
          'describeStacks',
          { StackName: 'foo' },
          { region: 'ap-northeast-1' }
        )
        .then(data => {
          expect(data).to.eql({ region: 'ap-northeast-1' });
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
        originalError: { message: 'EC2 Metadata roleName request returned error' },
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
        originalError: { message: 'EC2 Metadata roleName request returned error' },
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

    it('should set the signatureVersion to v4 if the serverSideEncryption is aws:kms', () => {
      // mocking S3 for testing
      class FakeS3 {
        constructor(config) {
          this.config = config;
        }

        putObject() {
          return {
            send: cb => cb(null, { config: this.config }),
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

      awsProvider.serverless.service.provider.deploymentBucketObject = {
        serverSideEncryption: 'aws:kms',
      };

      return awsProvider.request('S3', 'putObject', {}).then(data => {
        expect(data.config.signatureVersion).to.equal('v4');
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
            expect(Object.keys(results).length).to.equal(2);
            results.forEach(result => {
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
            expect(Object.keys(results).length).to.equal(numTests);
            results.forEach(result => {
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
        const relevantEnvironment = {
          AWS_SHARED_CREDENTIALS_FILE: getTmpFilePath('credentials'),
        };

        let newAwsProvider;

        let originalProviderProfile;
        let originalEnvironmentVariables;

        beforeEach(() => {
          originalProviderProfile = serverless.service.provider.profile;
          originalEnvironmentVariables = replaceEnv(relevantEnvironment);
          // fake an asynchronous credential process:
          const credProcessCode = `
            const credentials = {
              Version: 1,
              AccessKeyId: 'async_access_key_id',
              SessionToken: 'async_session_token',
            }
            console.log(JSON.stringify(credentials));
          `;
          const nodePath = process.execPath;
          const credProcessPath = getTmpFilePath('script.js');
          serverless.utils.writeFileSync(credProcessPath, credProcessCode);
          serverless.utils.writeFileSync(
            relevantEnvironment.AWS_SHARED_CREDENTIALS_FILE,
            '[no_default]\n' +
              'aws_access_key_id = default_access_key_id\n' +
              'aws_secret_access_key = default_aws_secret_access_key\n' +
              '\n' +
              '[async_profile]\n' +
              `credential_process = ${nodePath} ${credProcessPath}\n`
          );
          newAwsProvider = new AwsProvider(serverless, options);
        });

        afterEach(() => {
          replaceEnv(originalEnvironmentVariables);
          serverless.service.provider.profile = originalProviderProfile;
        });

        it('should retain reference to STS tokens when updated via SDK', async () => {
          const expectedToken = '_sts_refreshed_access_token_';

          serverless.service.provider.profile = 'async_profile';
          const { credentials } = newAwsProvider.getCredentials();
          await credentials.getPromise();

          const startToken = credentials.sessionToken;
          expect(startToken).to.equal('async_session_token');
          expect(startToken).to.not.equal(expectedToken);

          class FakeCloudFormation {
            constructor(config) {
              // Not sure where the the SDK resolves the STS, so for the test it's here
              this.credentials = config;
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
      yaml: {
        accessKeyId: 'yaml_aws_access_key_id',
        secretAccessKey: 'yaml_aws_secret_access_key',
        sessionToken: 'yaml_aws_session_token',
      },
      default: {
        accessKeyId: 'default_access_key_id',
        secretAccessKey: 'default_aws_secret_access_key',
      },
      otherDefault: {
        name: 'other_default',
        accessKeyId: 'other_default_access_key_id',
        secretAccessKey: 'other_default_aws_secret_access_key',
      },
      aProfile: {
        name: 'a_profile',
        accessKeyId: 'a_profile_access_key_id',
        secretAccessKey: 'a_profile_aws_secret_access_key',
      },
      anotherProfile: {
        name: 'another_profile',
        accessKeyId: 'another_profile_access_key_id',
        secretAccessKey: 'another_profile_aws_secret_access_key',
      },
      asyncProfile: {
        name: 'async_profile',
        accessKeyId: 'async_access_key_id',
        sessionToken: 'async_session_token',
      },
    };

    let originalProviderCredentials;
    let originalProviderProfile;
    let originalEnvironmentVariables;

    beforeEach(() => {
      originalProviderCredentials = serverless.service.provider.credentials;
      originalProviderProfile = serverless.service.provider.profile;
      originalEnvironmentVariables = replaceEnv(relevantEnvironment);
      // fake a credential process provider
      const credProcessCode = `
        const credentials = {
          Version: 1,
          AccessKeyId: '${fakeCredentials.asyncProfile.accessKeyId}',
          SessionToken: '${fakeCredentials.asyncProfile.sessionToken}',
        }
        console.log(JSON.stringify(credentials));
      `;
      const nodePath = process.execPath;
      const credProcessPath = getTmpFilePath('script.js');
      serverless.utils.writeFileSync(credProcessPath, credProcessCode);
      // make temporary credentials file
      serverless.utils.writeFileSync(
        relevantEnvironment.AWS_SHARED_CREDENTIALS_FILE,
        `[${fakeCredentials.aProfile.name}]\n` +
          `aws_access_key_id = ${fakeCredentials.aProfile.accessKeyId}\n` +
          `aws_secret_access_key = ${fakeCredentials.aProfile.secretAccessKey}\n` +
          '\n' +
          `[${fakeCredentials.anotherProfile.name}]\n` +
          `aws_access_key_id = ${fakeCredentials.anotherProfile.accessKeyId}\n` +
          `aws_secret_access_key = ${fakeCredentials.anotherProfile.secretAccessKey}\n` +
          '\n' +
          `[${fakeCredentials.asyncProfile.name}]\n` +
          `credential_process = ${nodePath} ${credProcessPath}\n`
      );
      newAwsProvider = new AwsProviderProxyquired(serverless, newOptions);
    });

    afterEach(() => {
      replaceEnv(originalEnvironmentVariables);
      serverless.service.provider.profile = originalProviderProfile;
      serverless.service.provider.credentials = originalProviderCredentials;
    });

    it('should not set credentials from provider if credentials is an empty object', async () => {
      serverless.service.provider.credentials = {};
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise().catch(() => null); // no valid credentials
      expect(credentials.accessKeyId).to.be.undefined;
      expect(credentials.secretAccessKey).to.be.undefined;
      expect(credentials.sessionToken).to.be.undefined;
    });

    it('should not set credentials from provider if credentials has undefined values', async () => {
      serverless.service.provider.credentials = {
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
      };
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise().catch(() => null); // no valid credentials
      expect(credentials.accessKeyId).to.be.undefined;
      expect(credentials.secretAccessKey).to.be.undefined;
      expect(credentials.sessionToken).to.be.undefined;
    });

    it('should not set credentials from provider if credentials has empty string values', async () => {
      serverless.service.provider.credentials = {
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: '',
      };
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise().catch(() => null); // no valid credentials
      expect(credentials.accessKeyId).to.be.undefined;
      expect(credentials.secretAccessKey).to.be.undefined;
      expect(credentials.sessionToken).to.be.undefined;
    });

    it('should get credentials from provider declared secret access key credentials', async () => {
      serverless.service.provider.credentials = {
        accessKeyId: fakeCredentials.yaml.accessKeyId,
        secretAccessKey: fakeCredentials.yaml.secretAccessKey,
      };
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.yaml.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.yaml.secretAccessKey);
      expect(credentials.sessionToken).to.be.undefined;
    });

    it('should get credentials from provider declared session token credentials', async () => {
      serverless.service.provider.credentials = {
        accessKeyId: fakeCredentials.yaml.accessKeyId,
        sessionToken: fakeCredentials.yaml.sessionToken,
      };
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.yaml.accessKeyId);
      expect(credentials.secretAccessKey).to.be.undefined;
      expect(credentials.sessionToken).to.equal(fakeCredentials.yaml.sessionToken);
    });

    it('should return the region', async () => {
      serverless.service.provider.credentials = {
        accessKeyId: fakeCredentials.yaml.accessKeyId,
        secretAccessKey: fakeCredentials.yaml.secretAccessKey,
      };
      const { region } = newAwsProvider.getCredentials();
      expect(region).to.equal('testregion');
    });

    it('should load profile credentials from AWS_SHARED_CREDENTIALS_FILE', async () => {
      serverless.service.provider.profile = fakeCredentials.aProfile.name;
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.aProfile.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.aProfile.secretAccessKey);
    });

    it('should load async profiles properly', async () => {
      serverless.service.provider.profile = fakeCredentials.asyncProfile.name;
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.asyncProfile.accessKeyId);
      expect(credentials.sessionToken).to.equal(fakeCredentials.asyncProfile.sessionToken);
    });

    it('should throw an error if a non-existent profile is set', done => {
      serverless.service.provider.profile = 'not-a-defined-profile';
      const { credentials } = newAwsProvider.getCredentials();
      credentials.get(err => {
        expect(err).not.to.be.undefined;
        done();
      });
    });

    it('should get credentials from environment declared for-all-stages credentials', async () => {
      const testVal = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      process.env.AWS_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_SESSION_TOKEN = testVal.sessionToken;

      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(testVal.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(testVal.secretAccessKey);
      expect(credentials.sessionToken).to.equal(testVal.sessionToken);
    });

    it('should get credentials from environment declared stage specific credentials', async () => {
      const testVal = {
        accessKeyId: 'stageAccessKeyId',
        secretAccessKey: 'stageSecretAccessKey',
        sessionToken: 'stageSessionToken',
      };
      process.env.AWS_TESTSTAGE_ACCESS_KEY_ID = testVal.accessKeyId;
      process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY = testVal.secretAccessKey;
      process.env.AWS_TESTSTAGE_SESSION_TOKEN = testVal.sessionToken;

      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(testVal.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(testVal.secretAccessKey);
      expect(credentials.sessionToken).to.equal(testVal.sessionToken);
    });

    it('should get credentials from environment declared for-all-stages profile', async () => {
      process.env.AWS_PROFILE = fakeCredentials.aProfile.name;
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.aProfile.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.aProfile.secretAccessKey);
    });

    it('should get credentials from environment declared from preferred stage-specific profile', async () => {
      process.env.AWS_PROFILE = fakeCredentials.anotherProfile.name;
      process.env.AWS_TESTSTAGE_PROFILE = fakeCredentials.aProfile.name;
      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.aProfile.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.aProfile.secretAccessKey);
    });

    it('should get credentials when profile is provided via --aws-profile option', async () => {
      process.env.AWS_PROFILE = fakeCredentials.anotherProfile.name;
      newAwsProvider.options['aws-profile'] = fakeCredentials.aProfile.name;

      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.aProfile.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.aProfile.secretAccessKey);
    });

    it('should get credentials when profile is provided via --aws-profile option even if profile is defined in serverless.yml', async () => {
      // eslint-disable-line max-len
      process.env.AWS_PROFILE = fakeCredentials.anotherProfile.name;
      serverless.service.provider.profile = fakeCredentials.anotherProfile.name;

      newAwsProvider.options['aws-profile'] = fakeCredentials.aProfile.name;

      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.aProfile.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.aProfile.secretAccessKey);
    });

    it('should get credentials when profile is provided via process.env.AWS_PROFILE even if profile is defined in serverless.yml', async () => {
      // eslint-disable-line max-len
      process.env.AWS_PROFILE = fakeCredentials.aProfile.name;

      serverless.service.provider.profile = fakeCredentials.anotherProfile.name;

      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.aProfile.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.aProfile.secretAccessKey);
    });

    it('should get credentials from process.env.AWS_DEFAULT_PROFILE, not "default"', async () => {
      process.env.AWS_DEFAULT_PROFILE = fakeCredentials.otherDefault.name;
      newAwsProvider.options['aws-profile'] = undefined;

      serverless.utils.appendFileSync(
        relevantEnvironment.AWS_SHARED_CREDENTIALS_FILE,
        '[default]\n' +
          `aws_access_key_id = ${fakeCredentials.default.accessKeyId}\n` +
          `aws_secret_access_key = ${fakeCredentials.default.secretAccessKey}\n` +
          '\n' +
          `[${fakeCredentials.otherDefault.name}]\n` +
          `aws_access_key_id = ${fakeCredentials.otherDefault.accessKeyId}\n` +
          `aws_secret_access_key = ${fakeCredentials.otherDefault.secretAccessKey}\n`
      );

      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.otherDefault.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.otherDefault.secretAccessKey);
    });

    it('should get "default" credentials in lieu of anything else', async () => {
      newAwsProvider.options['aws-profile'] = undefined;

      serverless.utils.appendFileSync(
        relevantEnvironment.AWS_SHARED_CREDENTIALS_FILE,
        '[default]\n' +
          `aws_access_key_id = ${fakeCredentials.default.accessKeyId}\n` +
          `aws_secret_access_key = ${fakeCredentials.default.secretAccessKey}\n`
      );

      const { credentials } = newAwsProvider.getCredentials();
      await credentials.getPromise();
      expect(credentials.accessKeyId).to.equal(fakeCredentials.default.accessKeyId);
      expect(credentials.secretAccessKey).to.equal(fakeCredentials.default.secretAccessKey);
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

    it('should support no prefix', () => {
      serverless.service.provider.deploymentPrefix = '';

      expect(awsProvider.getDeploymentPrefix()).to.equal('');
    });
  });

  describe('#getAlbTargetGroupPrefix()', () => {
    it('should return custom alb target group prefix if defined', () => {
      serverless.service.provider.alb = {};
      serverless.service.provider.alb.targetGroupPrefix = 'myPrefix';

      expect(awsProvider.getAlbTargetGroupPrefix()).to.equal(
        serverless.service.provider.alb.targetGroupPrefix
      );
    });

    it('should return empty string if alb is not defined', () => {
      serverless.service.provider.alb = undefined;

      expect(awsProvider.getAlbTargetGroupPrefix()).to.equal('');
    });

    it('should return empty string if not defined', () => {
      serverless.service.provider.alb = {};
      serverless.service.provider.alb.targetGroupPrefix = undefined;

      expect(awsProvider.getAlbTargetGroupPrefix()).to.equal('');
    });

    it('should support no prefix', () => {
      serverless.service.provider.alb = {};
      serverless.service.provider.alb.targetGroupPrefix = '';

      expect(awsProvider.getAlbTargetGroupPrefix()).to.equal('');
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
