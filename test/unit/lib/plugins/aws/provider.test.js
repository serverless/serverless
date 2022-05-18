'use strict';

/* eslint-disable no-unused-expressions */

const _ = require('lodash');
const chai = require('chai');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const overrideEnv = require('process-utils/override-env');

const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../lib/serverless');
const runServerless = require('../../../../utils/run-serverless');

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
    serverless = new Serverless({ ...options, commands: [], options: {} });
    serverless.cli = new serverless.classes.CLI();
    awsProvider = new AwsProvider(serverless, options);
  });
  afterEach(() => restoreEnv());

  describe('#constructor()', () => {
    it('should set Serverless instance', () => {
      expect(typeof awsProvider.serverless).to.not.equal('undefined');
    });

    it('should set the provider property', () => {
      expect(awsProvider.provider).to.equal(awsProvider);
    });

    describe('stage name validation', () => {
      const stages = ['myStage', 'my-stage', 'my_stage', "${opt:stage, 'prod'}"];
      stages.forEach((stage) => {
        it(`should not throw an error before variable population
            even if http event is present and stage is ${stage}`, () => {
          const config = {
            stage,
            commands: [],
            options: {},
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

  describe('#request()', () => {
    let awsRequestStub;
    let awsProviderProxied;

    beforeEach(() => {
      awsRequestStub = sinon.stub().resolves();
      awsRequestStub.memoized = sinon.stub().resolves();
      const AwsProviderProxyquired = proxyquire
        .noCallThru()
        .load('../../../../../lib/plugins/aws/provider.js', {
          '../../aws/request': awsRequestStub,
          '@serverless/utils/log': {
            log: {
              debug: sinon.stub(),
            },
          },
        });
      awsProviderProxied = new AwsProviderProxyquired(serverless, options);
    });

    afterEach(() => {});

    it('should pass resolved credentials as expected', async () => {
      awsProviderProxied.cachedCredentials = {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      };
      await awsProviderProxied.request('S3', 'getObject', {});
      expect(awsRequestStub.args[0][0]).to.deep.equal({
        name: 'S3',
        params: {
          ...awsProviderProxied.cachedCredentials,
          region: 'us-east-1',
          isS3TransferAccelerationEnabled: false,
        },
      });
    });

    it('should trigger the expected AWS SDK invokation', () => {
      return awsProviderProxied.request('S3', 'getObject', {}).then(() => {
        expect(awsRequestStub).to.have.been.calledOnce;
      });
    });

    it('should use local cache when using {useCache: true}', () => {
      return awsProviderProxied
        .request('S3', 'getObject', {}, { useCache: true })
        .then(() => awsProviderProxied.request('S3', 'getObject', {}, { useCache: true }))
        .then(() => {
          expect(awsRequestStub).to.not.have.been.called;
          expect(awsRequestStub.memoized).to.have.been.calledTwice;
        });
    });
  });

  describe('#getServerlessDeploymentBucketName()', () => {
    it('should return the name of the serverless deployment bucket', () => {
      const describeStackResourcesStub = sinon.stub(awsProvider, 'request').resolves({
        StackResourceDetail: {
          PhysicalResourceId: 'serverlessDeploymentBucketName',
        },
      });

      return awsProvider.getServerlessDeploymentBucketName().then((bucketName) => {
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

      return awsProvider.getServerlessDeploymentBucketName().then((bucketName) => {
        expect(describeStackResourcesStub.called).to.be.equal(false);
        expect(bucketName).to.equal('custom-bucket');
        awsProvider.request.restore();
      });
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

      return awsProvider.getAccountInfo().then((result) => {
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

      return awsProvider.getAccountId().then((result) => {
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

  describe('#disableTransferAccelerationForCurrentDeploy()', () => {
    it('should remove the corresponding option for the current deploy', () => {
      awsProvider.options['aws-s3-accelerate'] = true;
      awsProvider.disableTransferAccelerationForCurrentDeploy();
      return expect(awsProvider.options['aws-s3-accelerate']).to.be.undefined;
    });
  });
});

describe('test/unit/lib/plugins/aws/provider.test.js', () => {
  describe('#getProviderName and #sessionCache', () => {
    let sls;
    const expectedToken = '123';

    before(async () => {
      // Fake service that update credentials
      class FakeCloudFormation {
        constructor(credentials) {
          this.credentials = credentials;
          this.credentials.credentials.sessionToken = expectedToken;
        }
        describeStacks() {
          return { promise: async () => {} };
        }
      }
      // Stub functions for the credentials creation in the provider
      class SharedIniFileCredentials {
        constructor() {
          this.sessionToken = 'abc';
          this.accessKeyId = 'keyId';
          this.secretAccessKey = 'secret';
        }
      }
      class EnvironmentCredentials {
        constructor() {
          this.sessionToken = 'env';
          this.accessKeyId = 'keyId';
          this.secretAccessKey = 'secret';
        }
      }
      class FakeMetadataService {}

      const modulesCacheStub = {
        'aws-sdk': {
          SharedIniFileCredentials,
          EnvironmentCredentials,
          CloudFormation: FakeCloudFormation,
          config: {},
        },
        'aws-sdk/lib/metadata_service': FakeMetadataService,
      };
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        modulesCacheStub,
      });
      sls = serverless;
    });

    it('`AwsProvider.getProviderName()` should resolve provider name', () => {
      expect(AwsProvider.getProviderName()).to.equal('aws');
    });

    it('should retain sessionToken eventually updated internally by SDK', async () => {
      expect(sls.getProvider('aws').getCredentials().credentials.sessionToken).not.to.equal(
        expectedToken
      );
      await sls.getProvider('aws').request('CloudFormation', 'describeStacks');
      expect(sls.getProvider('aws').getCredentials().credentials.sessionToken).to.equal(
        expectedToken
      );
    });
  });

  describe('#getCredentials()', () => {
    before(async () => {
      // create default aws credentials file in before so that grouped run can use it
      await fs.ensureDir(path.resolve(os.homedir(), './.aws'));
      await fs.outputFile(
        path.resolve(os.homedir(), './.aws/credentials'),
        `
[default]
aws_access_key_id = DEFAULTKEYID
aws_secret_access_key = DEFAULTSECRET

[notDefault]
aws_access_key_id = NOTDEFAULTKEYID
aws_secret_access_key = NOTDEFAULTSECRET

[notDefaultWithRole]
source_profile = notDefault
role_arn = NOTDEFAULTWITHROLEROLE
`,
        { flag: 'w+' }
      );
    });

    it('should get credentials from default AWS profile', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
      });
      const awsCredentials = serverless.getProvider('aws').getCredentials();
      expect(awsCredentials.credentials.accessKeyId).to.equal('DEFAULTKEYID');
    });

    it('should get credentials from custom default AWS profile, set by AWS_DEFAULT_PROFILE', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
      });
      // getCredentials resolve the env when called
      let awsCredentials;
      overrideEnv(() => {
        process.env.AWS_DEFAULT_PROFILE = 'notDefault';
        awsCredentials = serverless.getProvider('aws').getCredentials();
      });
      expect(awsCredentials.credentials.accessKeyId).to.equal('NOTDEFAULTKEYID');
    });

    describe('assume role with provider.profile', () => {
      let awsCredentials;
      before(async () => {
        const { serverless } = await runServerless({
          fixture: 'aws',
          command: 'print',
          configExt: {
            provider: {
              profile: 'notDefaultWithRole',
            },
          },
        });
        awsCredentials = serverless.getProvider('aws').getCredentials();
      });

      it('should get credentials from `provider.profile`', () => {
        expect(awsCredentials.credentials.profile).to.equal('notDefaultWithRole');
      });

      it('should accept a role to assume on credentials', () => {
        expect(awsCredentials.credentials.roleArn).to.equal('NOTDEFAULTWITHROLEROLE');
      });
    });

    it('should get credentials from environment variables', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
      });
      let awsCredentials;
      // getCredentials resolve the env when called
      overrideEnv(() => {
        process.env.AWS_ACCESS_KEY_ID = 'ENVKEYID';
        process.env.AWS_SECRET_ACCESS_KEY = 'ENVSECRET';
        awsCredentials = serverless.getProvider('aws').getCredentials();
      });
      expect(awsCredentials.credentials.accessKeyId).to.equal('ENVKEYID');
    });

    describe('profile with non default credentials file', () => {
      let awsCredentials;
      before(async () => {
        await fs.outputFile(
          path.resolve(os.homedir(), './custom_credentials'),
          `
[default]
aws_access_key_id = DEFAULTKEYID
aws_secret_access_key = DEFAULTSECRET

[customProfile]
aws_access_key_id = CUSTOMKEYID
aws_secret_access_key = CUSTOMSECRET
`,
          { flag: 'w+' }
        );
        const { serverless } = await runServerless({
          fixture: 'aws',
          command: 'print',
        });
        // getCredentials resolve the env when called
        overrideEnv(() => {
          process.env.AWS_PROFILE = 'customProfile';
          process.env.AWS_SHARED_CREDENTIALS_FILE = path
            .resolve(os.homedir(), './custom_credentials')
            .toString();
          awsCredentials = serverless.getProvider('aws').getCredentials();
        });
      });

      after(async () => {
        await fs.remove(path.resolve(os.homedir(), './custom_credentials'));
      });

      it('should get credentials from AWS_PROFILE environment variable', () => {
        expect(awsCredentials.credentials.profile).to.equal('customProfile');
      });

      it('should get credentials from AWS_SHARED_CREDENTIALS_FILE environment variable', () => {
        expect(awsCredentials.credentials.accessKeyId).to.equal('CUSTOMKEYID');
      });
    });

    it('should get credentials from stage specific environment variables', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        configExt: {
          provider: {
            stage: 'testStage',
          },
        },
      });
      let awsCredentials;
      overrideEnv(() => {
        process.env.AWS_TESTSTAGE_ACCESS_KEY_ID = 'TESTSTAGEACCESSKEYID';
        process.env.AWS_TESTSTAGE_SECRET_ACCESS_KEY = 'TESTSTAGESECRET';
        awsCredentials = serverless.getProvider('aws').getCredentials();
      });
      expect(awsCredentials.credentials.accessKeyId).to.equal('TESTSTAGEACCESSKEYID');
    });

    it('should get credentials from AWS_{stage}_PROFILE environment variable', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        configExt: {
          provider: {
            stage: 'testStage',
          },
        },
      });
      let awsCredentials;
      overrideEnv(() => {
        process.env.AWS_TESTSTAGE_PROFILE = 'notDefault';
        awsCredentials = serverless.getProvider('aws').getCredentials();
      });
      expect(awsCredentials.credentials.accessKeyId).to.equal('NOTDEFAULTKEYID');
    });

    describe('profile with cli and encryption', () => {
      let awsCredentials;
      before(async () => {
        const { serverless } = await runServerless({
          fixture: 'aws',
          command: 'print',
          options: {
            'aws-profile': 'notDefault',
          },
          configExt: {
            provider: {
              deploymentBucket: {
                serverSideEncryption: 'aws:kms',
              },
            },
          },
        });
        awsCredentials = serverless.getProvider('aws').getCredentials();
      });

      it('should get credentials "--aws-profile" CLI option', () => {
        expect(awsCredentials.credentials.accessKeyId).to.equal('NOTDEFAULTKEYID');
      });

      it('should set the signatureVersion to v4 if the serverSideEncryption is aws:kms', () => {
        expect(awsCredentials.signatureVersion).to.equal('v4');
      });
    });

    it('should throw an error if a non-existent profile is set', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        options: {
          'aws-profile': 'nonExistent',
        },
      });
      expect(() => serverless.getProvider('aws').getCredentials()).to.throw(Error);
    });
  });

  describe('#getRegion()', () => {
    it('should default to "us-east-1"', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
      });
      expect(serverless.getProvider('aws').getRegion()).to.equal('us-east-1');
    });

    it('should allow to override via `provider.region`', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        configExt: {
          provider: {
            region: 'eu-central-1',
          },
        },
      });
      expect(serverless.getProvider('aws').getRegion()).to.equal('eu-central-1');
    });

    it('should allow to override via CLI `--region` param', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        options: { region: 'us-west-1' },
        configExt: {
          provider: {
            region: 'eu-central-1',
          },
        },
      });
      expect(serverless.getProvider('aws').getRegion()).to.equal('us-west-1');
    });
  });

  describe('#getProfile()', () => {
    it('should allow to set via `provider.profile`', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        configExt: {
          provider: {
            profile: 'test-profile',
          },
        },
      });
      expect(serverless.getProvider('aws').getProfile()).to.equal('test-profile');
    });

    it('should allow to set via CLI `--profile` param', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        options: { profile: 'cli-override' },
        configExt: {
          provider: {
            profile: 'test-profile',
          },
        },
      });
      expect(serverless.getProvider('aws').getProfile()).to.equal('cli-override');
    });

    it('should allow to set via CLI `--aws-profile` param', async () => {
      // Test with `provider.profile` `--profile` and `--aws-pofile` CLI param set
      // Confirm that `--aws-profile` overrides
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        options: {
          'profile': 'cli-override',
          'aws-profile': 'aws-override',
        },
        configExt: {
          provider: {
            profile: 'test-profile',
          },
        },
      });
      expect(serverless.getProvider('aws').getProfile()).to.equal('aws-override');
    });
  });

  describe('#getDeploymentPrefix()', () => {
    it('should put all artifacts in namespaced folder', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        command: 'package',
      });
      const functions = Object.values(cfTemplate.Resources).filter(
        (r) => r.Type === 'AWS::Lambda::Function'
      );
      expect(functions.length).to.be.greaterThanOrEqual(1);
      for (const f of functions) {
        expect(f.Properties.Code.S3Key)
          .to.be.a('string')
          .and.satisfy((key) => key.startsWith('serverless/'));
      }
    });

    it('should support custom namespaced folder', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          provider: {
            deploymentPrefix: 'test-prefix',
          },
        },
      });
      const functions = Object.values(cfTemplate.Resources).filter(
        (r) => r.Type === 'AWS::Lambda::Function'
      );
      expect(functions.length).to.be.greaterThanOrEqual(1);
      for (const f of functions) {
        expect(f.Properties.Code.S3Key)
          .to.be.a('string')
          .and.satisfy((key) => key.startsWith('test-prefix/'));
      }
    });
  });

  describe('#getAlbTargetGroupPrefix()', () => {
    it('should support `provider.alb.targetGroupPrefix`', async () => {
      const albId = '50dc6c495c0c9188';
      const validBaseEventConfig = {
        listenerArn: `arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/${albId}/f2f7dc8efc522ab2`,
        conditions: {
          path: '/',
        },
      };
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          provider: {
            alb: {
              targetGroupPrefix: 'a-prefix',
            },
          },
          functions: {
            fnTargetGroupName: {
              handler: 'index.handler',
              events: [
                {
                  alb: {
                    ...validBaseEventConfig,
                    priority: 1,
                  },
                },
              ],
            },
          },
        },
      });
      const targetGroups = Object.values(cfTemplate.Resources).filter(
        (r) => r.Type === 'AWS::ElasticLoadBalancingV2::TargetGroup'
      );
      expect(targetGroups.length).to.be.greaterThanOrEqual(1);
      for (const t of targetGroups) {
        expect(t.Properties.Name)
          .to.be.a('string')
          .and.satisfy((key) => key.startsWith('a-prefix'));
      }
    });
  });

  describe('#getStage()', () => {
    it('should default to "dev"', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
      });
      expect(serverless.getProvider('aws').getStage()).to.equal('dev');
    });

    it('should allow to override via `provider.stage`', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        configExt: {
          provider: {
            stage: 'staging',
          },
        },
      });
      expect(serverless.getProvider('aws').getStage()).to.equal('staging');
    });

    it('should allow to override via CLI `--stage` param', async () => {
      const { serverless } = await runServerless({
        fixture: 'aws',
        command: 'print',
        options: { stage: 'production' },
        configExt: {
          provider: {
            stage: 'staging',
          },
        },
      });
      expect(serverless.getProvider('aws').getStage()).to.equal('production');
    });
  });

  describe('when resolving images', () => {
    it('should fail if `functions[].image` references image with both path and uri', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              ecr: {
                images: {
                  invalidimage: {
                    path: './',
                    uri: '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
                  },
                },
              },
            },
            functions: {
              fnProviderInvalidImage: {
                image: 'invalidimage',
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ECR_IMAGE_BOTH_URI_AND_PATH_DEFINED_ERROR'
      );
    });

    it('should fail if `functions[].image` references image with both buildArgs and uri', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              ecr: {
                images: {
                  invalidimage: {
                    buildArgs: {
                      TESTKEY: 'TESTVAL',
                    },
                    uri: '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
                  },
                },
              },
            },
            functions: {
              fnProviderInvalidImage: {
                image: 'invalidimage',
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ECR_IMAGE_BOTH_URI_AND_BUILDARGS_DEFINED_ERROR'
      );
    });

    it('should fail if `functions[].image` references image with both cacheFrom and uri', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              ecr: {
                images: {
                  invalidimage: {
                    cacheFrom: ['my-image:latest'],
                    uri: '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
                  },
                },
              },
            },
            functions: {
              fnProviderInvalidImage: {
                image: 'invalidimage',
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ECR_IMAGE_BOTH_URI_AND_CACHEFROM_DEFINED_ERROR'
      );
    });

    it('should fail if `functions[].image` references image with both platform and uri', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              ecr: {
                images: {
                  invalidimage: {
                    platform: 'TESTVAL',
                    uri: '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
                  },
                },
              },
            },
            functions: {
              fnProviderInvalidImage: {
                image: 'invalidimage',
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ECR_IMAGE_BOTH_URI_AND_PLATFORM_DEFINED_ERROR'
      );
    });

    it('should fail if `functions[].image` references image without path and uri', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              ecr: {
                images: {
                  invalidimage: {},
                },
              },
            },
            functions: {
              fnProviderInvalidImage: {
                image: 'invalidimage',
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'ECR_IMAGE_NEITHER_URI_NOR_PATH_DEFINED_ERROR'
      );
    });

    it('should fail if `functions[].image` references image from `provider.ecr.images` that has invalid path', async () => {
      await expect(
        runServerless({
          fixture: 'ecr',
          command: 'package',
          shouldStubSpawn: true,
          configExt: {
            provider: {
              ecr: {
                images: {
                  baseimage: {
                    path: './invalid',
                  },
                },
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property('code', 'DOCKERFILE_NOT_AVAILABLE_ERROR');
    });

    it('should fail if `functions[].image` references image not defined in `provider.ecr.images`', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              fnInvalid: {
                image: 'undefinedimage',
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'REFERENCED_FUNCTION_IMAGE_NOT_DEFINED_IN_PROVIDER'
      );
    });

    it('should fail if both uri and name is provided for an image', async () => {
      await expect(
        runServerless({
          fixture: 'ecr',
          command: 'package',
          shouldStubSpawn: true,
          configExt: {
            functions: {
              foo: {
                image: {
                  name: 'baseimage',
                  uri: '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
                },
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'FUNCTION_IMAGE_BOTH_URI_AND_NAME_DEFINED_ERROR'
      );
    });

    it('should fail if neither uri nor name is provided for an image', async () => {
      await expect(
        runServerless({
          fixture: 'ecr',
          command: 'package',
          shouldStubSpawn: true,
          configExt: {
            functions: {
              foo: {
                image: {},
              },
            },
          },
        })
      ).to.be.eventually.rejected.and.have.property(
        'code',
        'FUNCTION_IMAGE_NEITHER_URI_NOR_NAME_DEFINED_ERROR'
      );
    });

    const findVersionCfConfig = (cfResources, fnLogicalId) =>
      Object.values(cfResources).find(
        (resource) =>
          resource.Type === 'AWS::Lambda::Version' &&
          resource.Properties.FunctionName.Ref === fnLogicalId
      ).Properties;

    describe('with `functions[].image` referencing existing images', () => {
      let cfResources;
      let naming;
      let serviceConfig;
      const imageSha = '6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38';
      const imageWithSha = `000000000000.dkr.ecr.us-east-1.amazonaws.com/test-lambda-docker@sha256:${imageSha}`;
      const imageDigestFromECR =
        'sha256:2e6b10a4b1ca0f6d3563a8a1f034dde7c4d7c93b50aa91f24311765d0822186b';
      const describeImagesStub = sinon
        .stub()
        .resolves({ imageDetails: [{ imageDigest: imageDigestFromECR }] });
      const awsRequestStubMap = {
        ECR: {
          describeImages: describeImagesStub,
        },
      };

      before(async () => {
        const { awsNaming, cfTemplate, fixtureData } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              ecr: {
                images: {
                  imagewithexplicituri: {
                    uri: imageWithSha,
                  },
                  imagewithimplicituri: imageWithSha,
                },
              },
            },
            functions: {
              fnImage: {
                image: imageWithSha,
              },
              fnImageWithTag: {
                image: '000000000000.dkr.ecr.us-east-1.amazonaws.com/test-lambda-docker:stable',
              },
              fnImageWithTagAndRepoWithSlashes: {
                image:
                  '000000000000.dkr.ecr.us-east-1.amazonaws.com/test-lambda/repo-docker:stable',
              },
              fnImageWithExplicitUri: {
                image: {
                  uri: imageWithSha,
                },
              },
              fnProviderImageWithExplicitUri: {
                image: 'imagewithexplicituri',
              },
              fnProviderImageWithImplicitUri: {
                image: 'imagewithimplicituri',
              },
            },
          },
          awsRequestStubMap,
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
        serviceConfig = fixtureData.serviceConfig;
      });

      it('should support `functions[].image` with implicit uri with sha', () => {
        const functionServiceConfig = serviceConfig.functions.fnImage;
        const functionCfLogicalId = naming.getLambdaLogicalId('fnImage');
        const functionCfConfig = cfResources[functionCfLogicalId].Properties;

        expect(functionCfConfig.Code).to.deep.equal({ ImageUri: functionServiceConfig.image });
        expect(functionCfConfig).to.not.have.property('Handler');
        expect(functionCfConfig).to.not.have.property('Runtime');

        const imageDigest = functionServiceConfig.image.slice(
          functionServiceConfig.image.lastIndexOf('@') + 1
        );
        expect(imageDigest).to.match(/^sha256:[a-f0-9]{64}$/);
        const imageDigestSha = imageDigest.slice('sha256:'.length);
        const versionCfConfig = findVersionCfConfig(cfResources, functionCfLogicalId);
        expect(versionCfConfig.CodeSha256).to.equal(imageDigestSha);
      });

      it('should support `functions[].image` with explicit uri with sha', () => {
        const functionServiceConfig = serviceConfig.functions.fnImageWithExplicitUri;
        const functionCfLogicalId = naming.getLambdaLogicalId('fnImageWithExplicitUri');
        const functionCfConfig = cfResources[functionCfLogicalId].Properties;

        expect(functionCfConfig.Code).to.deep.equal({ ImageUri: functionServiceConfig.image.uri });
        expect(functionCfConfig).to.not.have.property('Handler');
        expect(functionCfConfig).to.not.have.property('Runtime');

        const imageDigest = functionServiceConfig.image.uri.slice(
          functionServiceConfig.image.uri.lastIndexOf('@') + 1
        );
        expect(imageDigest).to.match(/^sha256:[a-f0-9]{64}$/);
        const imageDigestSha = imageDigest.slice('sha256:'.length);
        const versionCfConfig = findVersionCfConfig(cfResources, functionCfLogicalId);
        expect(versionCfConfig.CodeSha256).to.equal(imageDigestSha);
      });

      it('should support `functions[].image` with tag', () => {
        const functionServiceConfig = serviceConfig.functions.fnImageWithTag;
        const functionCfLogicalId = naming.getLambdaLogicalId('fnImageWithTag');
        const functionCfConfig = cfResources[functionCfLogicalId].Properties;

        expect(functionCfConfig.Code).to.deep.equal({
          ImageUri: `${functionServiceConfig.image.split(':')[0]}@${imageDigestFromECR}`,
        });
        expect(functionCfConfig).to.not.have.property('Handler');
        expect(functionCfConfig).to.not.have.property('Runtime');

        const versionCfConfig = findVersionCfConfig(cfResources, functionCfLogicalId);
        expect(versionCfConfig.CodeSha256).to.equal(imageDigestFromECR.slice('sha256:'.length));
        expect(describeImagesStub).to.be.calledWith({
          imageIds: [{ imageTag: 'stable' }],
          registryId: '000000000000',
          repositoryName: 'test-lambda-docker',
        });
      });

      it('should support `functions[].image` with tag and repository name with slash', () => {
        const functionServiceConfig = serviceConfig.functions.fnImageWithTagAndRepoWithSlashes;
        const functionCfLogicalId = naming.getLambdaLogicalId('fnImageWithTagAndRepoWithSlashes');
        const functionCfConfig = cfResources[functionCfLogicalId].Properties;

        expect(functionCfConfig.Code).to.deep.equal({
          ImageUri: `${functionServiceConfig.image.split(':')[0]}@${imageDigestFromECR}`,
        });
        expect(functionCfConfig).to.not.have.property('Handler');
        expect(functionCfConfig).to.not.have.property('Runtime');

        const versionCfConfig = findVersionCfConfig(cfResources, functionCfLogicalId);
        expect(versionCfConfig.CodeSha256).to.equal(imageDigestFromECR.slice('sha256:'.length));
        expect(describeImagesStub).to.be.calledWith({
          imageIds: [{ imageTag: 'stable' }],
          registryId: '000000000000',
          repositoryName: 'test-lambda/repo-docker',
        });
      });

      it('should support `functions[].image` that references provider.ecr.images defined with explicit uri', () => {
        const functionCfLogicalId = naming.getLambdaLogicalId('fnProviderImageWithExplicitUri');
        const functionCfConfig = cfResources[functionCfLogicalId].Properties;

        expect(functionCfConfig.Code).to.deep.equal({
          ImageUri: imageWithSha,
        });
        expect(functionCfConfig).to.not.have.property('Handler');
        expect(functionCfConfig).to.not.have.property('Runtime');

        const versionCfConfig = findVersionCfConfig(cfResources, functionCfLogicalId);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
      });

      it('should support `functions[].image` that references provider.ecr.images defined with implicit uri', () => {
        const functionCfLogicalId = naming.getLambdaLogicalId('fnProviderImageWithImplicitUri');
        const functionCfConfig = cfResources[functionCfLogicalId].Properties;

        expect(functionCfConfig.Code).to.deep.equal({
          ImageUri: imageWithSha,
        });
        expect(functionCfConfig).to.not.have.property('Handler');
        expect(functionCfConfig).to.not.have.property('Runtime');

        const versionCfConfig = findVersionCfConfig(cfResources, functionCfLogicalId);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
      });

      it('should fail when `functions[].image` when image uri region does not match the provider region', async () => {
        const imageRegion = 'sa-east-1';
        const imageWithoutSha = `000000000000.dkr.ecr.${imageRegion}.amazonaws.com/test-lambda-docker`;
        await expect(
          runServerless({
            fixture: 'function',
            command: 'package',
            configExt: {
              provider: {
                region: 'us-east-1',
              },
              functions: {
                fnImageWithExplicitUriInvalidRegion: {
                  image: imageWithoutSha,
                },
              },
            },
          })
        ).to.be.eventually.rejected.and.have.property('code', 'LAMBDA_ECR_REGION_MISMATCH_ERROR');
      });
    });

    describe('with `functions[].image` referencing images that require building', () => {
      const imageSha = '6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38';
      const repositoryUri = '999999999999.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker';
      const authorizationToken = 'YXdzOmRvY2tlcmF1dGh0b2tlbg==';
      const proxyEndpoint = `https://${repositoryUri}`;
      const describeRepositoriesStub = sinon.stub();
      const createRepositoryStub = sinon.stub();
      const createRepositoryStubScanOnPush = sinon.stub();
      const baseAwsRequestStubMap = {
        STS: {
          getCallerIdentity: {
            ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
            UserId: 'XXXXXXXXXXXXXXXXXXXXX',
            Account: '999999999999',
            Arn: 'arn:aws:iam::999999999999:user/test',
          },
        },
        ECR: {
          describeRepositories: {
            repositories: [{ repositoryUri }],
          },
          getAuthorizationToken: {
            authorizationData: [
              {
                proxyEndpoint,
                authorizationToken,
              },
            ],
          },
        },
      };
      const spawnExtStub = sinon.stub().returns({
        stdBuffer: `digest: sha256:${imageSha} size: 1787`,
      });
      const modulesCacheStub = {
        'child-process-ext/spawn': spawnExtStub,
        './lib/utils/telemetry/generate-payload.js': () => ({}),
      };

      beforeEach(() => {
        describeRepositoriesStub.reset();
        createRepositoryStub.reset();
        spawnExtStub.resetHistory();
      });

      it('should work correctly when repository exists beforehand', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const {
          awsNaming,
          cfTemplate,
          fixtureData: { servicePath: serviceDir },
        } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = findVersionCfConfig(cfTemplate.Resources, functionCfLogicalId);

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(spawnExtStub).to.be.calledWith('docker', ['--version']);
        expect(spawnExtStub).not.to.be.calledWith('docker', [
          'login',
          '--username',
          'AWS',
          '--password',
          'dockerauthtoken',
          proxyEndpoint,
        ]);
        expect(spawnExtStub).to.be.calledWith('docker', [
          'build',
          '-t',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          '-f',
          path.join(serviceDir, 'Dockerfile'),
          './',
        ]);
        expect(spawnExtStub).to.be.calledWith('docker', [
          'tag',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          `${repositoryUri}:baseimage`,
        ]);
        expect(spawnExtStub).to.be.calledWith('docker', ['push', `${repositoryUri}:baseimage`]);
      });

      it('should work correctly when repository does not exist beforehand and scanOnPush is set', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.throws({
              providerError: { code: 'RepositoryNotFoundException' },
            }),
            createRepository: createRepositoryStubScanOnPush.resolves({
              repository: { repositoryUri },
            }),
          },
        };

        const { awsNaming, cfTemplate } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
          configExt: {
            provider: {
              ecr: {
                scanOnPush: true,
                images: {
                  baseimage: {
                    path: './',
                    file: 'Dockerfile.dev',
                  },
                },
              },
            },
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = findVersionCfConfig(cfTemplate.Resources, functionCfLogicalId);

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStubScanOnPush).to.be.calledOnce;
        expect(createRepositoryStubScanOnPush.args[0][0].imageScanningConfiguration).to.deep.equal({
          scanOnPush: true,
        });
      });

      it('should work correctly when repository does not exist beforehand', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.throws({
              providerError: { code: 'RepositoryNotFoundException' },
            }),
            createRepository: createRepositoryStub.resolves({ repository: { repositoryUri } }),
          },
        };

        const { awsNaming, cfTemplate } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = findVersionCfConfig(cfTemplate.Resources, functionCfLogicalId);

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub).to.be.calledOnce;
      });

      it('should login and retry when docker push fails with no basic auth credentials error', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const innerSpawnExtStub = sinon
          .stub()
          .returns({
            stdBuffer: `digest: sha256:${imageSha} size: 1787`,
          })
          .onCall(3)
          .throws({ stdBuffer: 'no basic auth credentials' });
        const {
          awsNaming,
          cfTemplate,
          fixtureData: { servicePath: serviceDir },
        } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub: {
            ...modulesCacheStub,
            'child-process-ext/spawn': innerSpawnExtStub,
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = findVersionCfConfig(cfTemplate.Resources, functionCfLogicalId);

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(innerSpawnExtStub).to.be.calledWith('docker', ['--version']);
        expect(innerSpawnExtStub).to.be.calledWith('docker', [
          'build',
          '-t',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          '-f',
          path.join(serviceDir, 'Dockerfile'),
          './',
        ]);
        expect(innerSpawnExtStub).to.be.calledWith('docker', [
          'tag',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          `${repositoryUri}:baseimage`,
        ]);
        expect(innerSpawnExtStub).to.be.calledWith('docker', [
          'push',
          `${repositoryUri}:baseimage`,
        ]);
        expect(innerSpawnExtStub).to.be.calledWith('docker', [
          'login',
          '--username',
          'AWS',
          '--password',
          'dockerauthtoken',
          proxyEndpoint,
        ]);
      });

      it('should login and retry when docker push fails with token has expired error', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const innerSpawnExtStub = sinon
          .stub()
          .returns({
            stdBuffer: `digest: sha256:${imageSha} size: 1787`,
          })
          .onCall(3)
          .throws({ stdBuffer: 'authorization token has expired' });
        await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub: {
            ...modulesCacheStub,
            'child-process-ext/spawn': innerSpawnExtStub,
          },
        });

        expect(innerSpawnExtStub).to.be.calledWith('docker', [
          'push',
          `${repositoryUri}:baseimage`,
        ]);
        expect(innerSpawnExtStub).to.be.calledWith('docker', [
          'login',
          '--username',
          'AWS',
          '--password',
          'dockerauthtoken',
          proxyEndpoint,
        ]);
      });

      it('should work correctly when image is defined with implicit path in provider', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const { awsNaming, cfTemplate } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
          configExt: {
            provider: {
              ecr: {
                images: {
                  baseimage: './',
                },
              },
            },
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = Object.values(cfTemplate.Resources).find(
          (resource) =>
            resource.Type === 'AWS::Lambda::Version' &&
            resource.Properties.FunctionName.Ref === functionCfLogicalId
        ).Properties;

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
      });

      it('should work correctly when image is defined with `file` set', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const {
          awsNaming,
          cfTemplate,
          fixtureData: { servicePath: serviceDir },
        } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
          configExt: {
            provider: {
              ecr: {
                images: {
                  baseimage: {
                    path: './',
                    file: 'Dockerfile.dev',
                  },
                },
              },
            },
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = Object.values(cfTemplate.Resources).find(
          (resource) =>
            resource.Type === 'AWS::Lambda::Version' &&
            resource.Properties.FunctionName.Ref === functionCfLogicalId
        ).Properties;

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(spawnExtStub).to.be.calledWith('docker', [
          'build',
          '-t',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          '-f',
          path.join(serviceDir, 'Dockerfile.dev'),
          './',
        ]);
      });

      it('should work correctly when image is defined with `cacheFrom` set', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const {
          awsNaming,
          cfTemplate,
          fixtureData: { servicePath: serviceDir },
        } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
          configExt: {
            provider: {
              ecr: {
                images: {
                  baseimage: {
                    path: './',
                    file: 'Dockerfile.dev',
                    cacheFrom: ['my-image:latest'],
                  },
                },
              },
            },
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = Object.values(cfTemplate.Resources).find(
          (resource) =>
            resource.Type === 'AWS::Lambda::Version' &&
            resource.Properties.FunctionName.Ref === functionCfLogicalId
        ).Properties;

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(spawnExtStub).to.be.calledWith('docker', [
          'build',
          '-t',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          '-f',
          path.join(serviceDir, 'Dockerfile.dev'),
          '--cache-from',
          'my-image:latest',
          './',
        ]);
      });

      it('should work correctly when image is defined with `buildArgs` set', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const {
          awsNaming,
          cfTemplate,
          fixtureData: { servicePath: serviceDir },
        } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
          configExt: {
            provider: {
              ecr: {
                images: {
                  baseimage: {
                    path: './',
                    file: 'Dockerfile.dev',
                    buildArgs: {
                      TESTKEY: 'TESTVAL',
                    },
                  },
                },
              },
            },
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = Object.values(cfTemplate.Resources).find(
          (resource) =>
            resource.Type === 'AWS::Lambda::Version' &&
            resource.Properties.FunctionName.Ref === functionCfLogicalId
        ).Properties;

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(spawnExtStub).to.be.calledWith('docker', [
          'build',
          '-t',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          '-f',
          path.join(serviceDir, 'Dockerfile.dev'),
          '--build-arg',
          'TESTKEY=TESTVAL',
          './',
        ]);
      });

      it('should work correctly when image is defined with `platform` set', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const {
          awsNaming,
          cfTemplate,
          fixtureData: { servicePath: serviceDir },
        } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
          configExt: {
            provider: {
              ecr: {
                images: {
                  baseimage: {
                    path: './',
                    file: 'Dockerfile.dev',
                    platform: 'TESTVAL',
                  },
                },
              },
            },
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = Object.values(cfTemplate.Resources).find(
          (resource) =>
            resource.Type === 'AWS::Lambda::Version' &&
            resource.Properties.FunctionName.Ref === functionCfLogicalId
        ).Properties;

        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(spawnExtStub).to.be.calledWith('docker', [
          'build',
          '-t',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          '-f',
          path.join(serviceDir, 'Dockerfile.dev'),
          './',
          '--platform=TESTVAL',
        ]);
      });

      it('should work correctly when `functions[].image` is defined with explicit name', async () => {
        const awsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const { awsNaming, cfTemplate } = await runServerless({
          fixture: 'ecr',
          command: 'package',
          awsRequestStubMap,
          modulesCacheStub,
          configExt: {
            provider: {
              ecr: {
                images: {
                  baseimage: './',
                },
              },
            },
            functions: {
              foo: {
                image: {
                  name: 'baseimage',
                },
              },
            },
          },
        });

        const functionCfLogicalId = awsNaming.getLambdaLogicalId('foo');
        const functionCfConfig = cfTemplate.Resources[functionCfLogicalId].Properties;
        const versionCfConfig = findVersionCfConfig(cfTemplate.Resources, functionCfLogicalId);
        expect(functionCfConfig.Code.ImageUri).to.deep.equal(`${repositoryUri}@sha256:${imageSha}`);
        expect(versionCfConfig.CodeSha256).to.equal(imageSha);
      });

      it('should fail when docker command is not available', async () => {
        await expect(
          runServerless({
            fixture: 'ecr',
            command: 'package',
            awsRequestStubMap: baseAwsRequestStubMap,
            modulesCacheStub: {
              'child-process-ext/spawn': sinon.stub().throws(),
            },
          })
        ).to.be.eventually.rejected.and.have.property('code', 'DOCKER_COMMAND_NOT_AVAILABLE');
      });

      it('should fail when docker build fails', async () => {
        await expect(
          runServerless({
            fixture: 'ecr',
            command: 'package',
            awsRequestStubMap: baseAwsRequestStubMap,
            modulesCacheStub: {
              ...modulesCacheStub,
              'child-process-ext/spawn': sinon.stub().returns({}).onSecondCall().throws(),
            },
          })
        ).to.be.eventually.rejected.and.have.property('code', 'DOCKER_BUILD_ERROR');
      });

      it('should fail when docker tag fails', async () => {
        await expect(
          runServerless({
            fixture: 'ecr',
            command: 'package',
            awsRequestStubMap: baseAwsRequestStubMap,
            modulesCacheStub: {
              ...modulesCacheStub,
              'child-process-ext/spawn': sinon.stub().returns({}).onCall(2).throws(),
            },
          })
        ).to.be.eventually.rejected.and.have.property('code', 'DOCKER_TAG_ERROR');
      });

      it('should fail when docker push fails', async () => {
        await expect(
          runServerless({
            fixture: 'ecr',
            command: 'package',
            awsRequestStubMap: baseAwsRequestStubMap,
            modulesCacheStub: {
              ...modulesCacheStub,
              'child-process-ext/spawn': sinon.stub().returns({}).onCall(3).throws(),
            },
          })
        ).to.be.eventually.rejected.and.have.property('code', 'DOCKER_PUSH_ERROR');
      });

      it('should fail when docker login fails', async () => {
        await expect(
          runServerless({
            fixture: 'ecr',
            command: 'package',
            awsRequestStubMap: baseAwsRequestStubMap,
            modulesCacheStub: {
              ...modulesCacheStub,
              'child-process-ext/spawn': sinon
                .stub()
                .returns({})
                .onCall(3)
                .throws({ stdBuffer: 'no basic auth credentials' })
                .onCall(4)
                .throws(),
            },
          })
        ).to.be.eventually.rejected.and.have.property('code', 'DOCKER_LOGIN_ERROR');
      });
    });
  });
});
