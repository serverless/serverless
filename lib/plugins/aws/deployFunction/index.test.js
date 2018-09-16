'use strict';
/* eslint-disable no-unused-expressions */
const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const proxyquire = require('proxyquire');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const testUtils = require('../../../../tests/utils');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('AwsDeployFunction', () => {
  let AwsDeployFunction;
  let serverless;
  let awsDeployFunction;
  let cryptoStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.servicePath = true;
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    };
    serverless.service.functions = {
      first: {
        handler: true,
      },
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
      functionObj: {
        name: 'first',
      },
    };
    serverless.init();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    cryptoStub = {
      createHash: function () { return this; }, // eslint-disable-line
      update: function () { return this; }, // eslint-disable-line
      digest: sinon.stub(),
    };
    AwsDeployFunction = proxyquire('./index.js', {
      crypto: cryptoStub,
    });
    awsDeployFunction = new AwsDeployFunction(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeployFunction.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsDeployFunction.provider).to.be.instanceof(AwsProvider));

    it('should set an empty options object if no options are given', () => {
      const awsDeployFunctionWithEmptyOptions = new AwsDeployFunction(serverless);

      expect(awsDeployFunctionWithEmptyOptions.options).to.deep.equal({});
    });
  });

  describe('#checkIfFunctionExists()', () => {
    let getFunctionStub;

    beforeEach(() => {
      getFunctionStub = sinon
        .stub(awsDeployFunction.provider, 'request')
        .resolves({ func: { name: 'first' } });
    });

    afterEach(() => {
      awsDeployFunction.provider.request.restore();
    });

    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsDeployFunction.checkIfFunctionExists()).to.throw(Error);
    });

    it('should check if the function is deployed and save the result', () => {
      awsDeployFunction.serverless.service.functions = {
        first: {
          name: 'first',
          handler: 'handler.first',
        },
      };

      return awsDeployFunction.checkIfFunctionExists().then(() => {
        expect(getFunctionStub.calledOnce).to.be.equal(true);
        expect(getFunctionStub.calledWithExactly(
          'Lambda',
          'getFunction',
          {
            FunctionName: 'first',
          }
        )).to.be.equal(true);
        expect(awsDeployFunction.serverless.service.provider.remoteFunctionData).to.deep.equal({
          func: {
            name: 'first',
          },
        });
      });
    });
  });

  describe('#normalizeArnRole', () => {
    let getAccountInfoStub;
    let getRoleStub;

    beforeEach(() => {
      getAccountInfoStub = sinon
        .stub(awsDeployFunction.provider, 'getAccountInfo')
        .resolves({ accountId: '123456789012', partition: 'aws' });
      getRoleStub = sinon
        .stub(awsDeployFunction.provider, 'request')
        .resolves({ Arn: 'arn:aws:iam::123456789012:role/role_2' });

      serverless.service.resources = {
        Resources: {
          MyCustomRole: {
            Type: 'AWS::IAM::Role',
            Properties: {
              RoleName: 'role_123',
            },
          },
        },
      };
    });

    afterEach(() => {
      awsDeployFunction.provider.getAccountInfo.restore();
      awsDeployFunction.provider.request.restore();
      serverless.service.resources = undefined;
    });

    it('should return unmodified ARN if ARN was provided', () => {
      const arn = 'arn:aws:iam::123456789012:role/role';

      return awsDeployFunction.normalizeArnRole(arn).then((result) => {
        expect(getAccountInfoStub).to.not.have.been.called;
        expect(result).to.be.equal(arn);
      });
    });

    it('should return compiled ARN if role name was provided', () => {
      const roleName = 'MyCustomRole';

      return awsDeployFunction.normalizeArnRole(roleName).then((result) => {
        expect(getAccountInfoStub).to.have.been.called;
        expect(result).to.be.equal('arn:aws:iam::123456789012:role/role_123');
      });
    });

    it('should return compiled ARN if object role was provided', () => {
      const roleObj = {
        'Fn::GetAtt': [
          'role_2',
          'Arn',
        ],
      };

      return awsDeployFunction.normalizeArnRole(roleObj).then((result) => {
        expect(getRoleStub.calledOnce).to.be.equal(true);
        expect(getAccountInfoStub).to.not.have.been.called;
        expect(result).to.be.equal('arn:aws:iam::123456789012:role/role_2');
      });
    });
  });

  describe('#updateFunctionConfiguration', () => {
    let updateFunctionConfigurationStub;
    let normalizeArnRoleStub;
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
      functionObj: {
        name: 'first',
      },
    };

    beforeEach(() => {
      updateFunctionConfigurationStub = sinon
        .stub(awsDeployFunction.provider, 'request')
        .resolves();

      normalizeArnRoleStub = sinon
        .stub(awsDeployFunction, 'normalizeArnRole')
        .resolves('arn:aws:us-east-1:123456789012:role/role');
    });

    afterEach(() => {
      awsDeployFunction.provider.request.restore();
      awsDeployFunction.normalizeArnRole.restore();
      awsDeployFunction.serverless.service.provider.timeout = undefined;
      awsDeployFunction.serverless.service.provider.memorySize = undefined;
      awsDeployFunction.serverless.service.provider.role = undefined;
      awsDeployFunction.serverless.service.provider.vpc = undefined;
    });

    it('should update function\'s configuration', () => {
      options.functionObj = {
        awsKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012',
        description: 'desc',
        handler: 'my_handler',
        environment: {
          VARIABLE: 'value',
        },
        name: 'first',
        memorySize: 128,
        onError: 'arn:aws:sqs:us-east-1:123456789012:dlq',
        role: 'arn:aws:iam::123456789012:role/Admin',
        timeout: 3,
        vpc: {
          securityGroupIds: ['1'],
          subnetIds: ['2'],
        },
      };

      awsDeployFunction.options = options;

      return awsDeployFunction.updateFunctionConfiguration().then(() => {
        expect(normalizeArnRoleStub.calledOnce).to.be.equal(true);
        expect(normalizeArnRoleStub.calledWithExactly('arn:aws:iam::123456789012:role/Admin'));
        expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
        expect(updateFunctionConfigurationStub.calledWithExactly(
          'Lambda',
          'updateFunctionConfiguration',
          {
            DeadLetterConfig: {
              TargetArn: 'arn:aws:sqs:us-east-1:123456789012:dlq',
            },
            Handler: 'my_handler',
            Description: 'desc',
            Environment: {
              Variables: {
                VARIABLE: 'value',
              },
            },
            FunctionName: 'first',
            KMSKeyArn: 'arn:aws:kms:us-east-1:123456789012',
            MemorySize: 128,
            Role: 'arn:aws:us-east-1:123456789012:role/role',
            Timeout: 3,
            VpcConfig: {
              SecurityGroupIds: ['1'],
              SubnetIds: ['2'],
            },
          }
        )).to.be.equal(true);
      });
    });

    it('should update only specified params', () => {
      options.functionObj = {
        name: 'first',
        description: 'change',
        vpc: undefined,
      };

      awsDeployFunction.options = options;

      return awsDeployFunction.updateFunctionConfiguration().then(() => {
        expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
        expect(updateFunctionConfigurationStub.calledWithExactly(
          'Lambda',
          'updateFunctionConfiguration',
          {
            FunctionName: 'first',
            Description: 'change',
          }
        )).to.be.equal(true);
      });
    });

    it('should skip elements that contain references', () => {
      options.functionObj = {
        name: 'first',
        description: 'change',
        handler: 'my_handler',
        vpc: {
          securityGroupIds: ['xxxxx', {
            ref: 'myVPCRef',
          }],
          subnetIds: ['xxxxx', {
            ref: 'myVPCRef',
          }],
        },
        environment: {
          myvar: 'this is my var',
          myref: {
            ref: 'aCFReference',
          },
        },
      };

      awsDeployFunction.options = options;

      return awsDeployFunction.updateFunctionConfiguration().then(() => {
        expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
        expect(updateFunctionConfigurationStub.calledWithExactly(
          'Lambda',
          'updateFunctionConfiguration',
          {
            FunctionName: 'first',
            Handler: 'my_handler',
            Description: 'change',
          }
        )).to.be.equal(true);
      });
    });

    it('should do nothing if only references are in', () => {
      options.functionObj = {
        name: 'first',
        environment: {
          myvar: 'this is my var',
          myref: {
            ref: 'aCFReference',
          },
        },
      };

      awsDeployFunction.options = options;

      return expect(awsDeployFunction.updateFunctionConfiguration()).to.be.fulfilled
        .then(() => expect(updateFunctionConfigurationStub).to.not.be.called);
    });

    it('should fail when using invalid characters in environment variable', () => {
      options.functionObj = {
        name: 'first',
        description: 'change',
        environment: {
          '!llegal_v@riable': 1,
        },
      };

      awsDeployFunction.options = options;

      expect(() => awsDeployFunction.updateFunctionConfiguration()).to.throw(Error);
    });

    it('should transform to string values when using non-string values as environment variables',
      () => {
        options.functionObj = {
          name: 'first',
          handler: 'my_handler',
          description: 'change',
          environment: {
            COUNTER: 6,
          },
        };

        awsDeployFunction.options = options;
        return expect(awsDeployFunction.updateFunctionConfiguration()).to.be.fulfilled
          .then(() => {
            expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
            expect(updateFunctionConfigurationStub.calledWithExactly(
              'Lambda',
              'updateFunctionConfiguration',
              {
                FunctionName: 'first',
                Handler: 'my_handler',
                Description: 'change',
                Environment: {
                  Variables: {
                    COUNTER: '6',
                  },
                },
              }
            )).to.be.equal(true);
          });
      });

    it('should inherit provider-level config', () => {
      options.functionObj = {
        name: 'first',
        handler: 'my_handler',
        description: 'change',
      };

      awsDeployFunction.serverless.service.provider.timeout = 12;
      awsDeployFunction.serverless.service.provider.memorySize = 512;
      awsDeployFunction.serverless.service.provider.role = 'role';
      awsDeployFunction.serverless.service.provider.vpc = {
        securityGroupIds: [123, 12],
        subnetIds: [1234, 12345],
      };

      awsDeployFunction.options = options;

      return awsDeployFunction.updateFunctionConfiguration().then(() => {
        expect(normalizeArnRoleStub.calledOnce).to.be.equal(true);
        expect(normalizeArnRoleStub.calledWithExactly('role'));
        expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
        expect(updateFunctionConfigurationStub.calledWithExactly(
          'Lambda',
          'updateFunctionConfiguration',
          {
            FunctionName: 'first',
            Handler: 'my_handler',
            Description: 'change',
            VpcConfig: {
              SubnetIds: [1234, 12345],
              SecurityGroupIds: [123, 12],
            },
            Timeout: 12,
            MemorySize: 512,
            Role: 'arn:aws:us-east-1:123456789012:role/role',
          }
        )).to.be.equal(true);
      });
    });
  });

  describe('#deployFunction()', () => {
    let artifactFilePath;
    let updateFunctionCodeStub;
    let statSyncStub;
    let readFileSyncStub;

    beforeEach(() => {
      // write a file to disc to simulate that the deployment artifact exists
      awsDeployFunction.packagePath = testUtils.getTmpDirPath();
      artifactFilePath = path.join(awsDeployFunction.packagePath, 'first.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'first.zip file content');
      updateFunctionCodeStub = sinon
        .stub(awsDeployFunction.provider, 'request')
        .resolves();
      statSyncStub = sinon
        .stub(fs, 'statSync')
        .returns({ size: 1024 });
      sinon.spy(awsDeployFunction.serverless.cli, 'log');
      readFileSyncStub = sinon
        .stub(fs, 'readFileSync')
        .returns();
      awsDeployFunction.serverless.service.provider.remoteFunctionData = {
        Configuration: {
          CodeSha256: 'remote-hash-zip-file',
        },
      };
    });

    afterEach(() => {
      awsDeployFunction.provider.request.restore();
      fs.statSync.restore();
      fs.readFileSync.restore();
    });

    it('should deploy the function if the hashes are different', () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-zip-file');

      return awsDeployFunction.deployFunction().then(() => {
        const data = fs.readFileSync(artifactFilePath);

        expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
        expect(readFileSyncStub.called).to.equal(true);
        expect(updateFunctionCodeStub.calledWithExactly(
          'Lambda',
          'updateFunctionCode',
          {
            FunctionName: 'first',
            ZipFile: data,
          }
        )).to.be.equal(true);
        expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
      });
    });

    it('should deploy the function if the hashes are same but the "force" option is used', () => {
      awsDeployFunction.options.force = true;
      cryptoStub.createHash().update().digest.onCall(0).returns('remote-hash-zip-file');

      return awsDeployFunction.deployFunction().then(() => {
        const data = fs.readFileSync(artifactFilePath);

        expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
        expect(readFileSyncStub.called).to.equal(true);
        expect(updateFunctionCodeStub.calledWithExactly(
          'Lambda',
          'updateFunctionCode',
          {
            FunctionName: 'first',
            ZipFile: data,
          }
        )).to.be.equal(true);
        expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
      });
    });

    it('should resolve if the hashes are the same', () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('remote-hash-zip-file');

      return awsDeployFunction.deployFunction().then(() => {
        const expected = 'Code not changed. Skipping function deployment.';

        expect(updateFunctionCodeStub.calledOnce).to.be.equal(false);
        expect(readFileSyncStub.calledOnce).to.equal(true);
        expect(awsDeployFunction.serverless.cli.log.calledWithExactly(expected)).to.equal(true);
        expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
      });
    });

    it('should log artifact size', () => {
      // awnY7Oi280gp5kTCloXzsqJCO4J766x6hATWqQsN/uM= <-- hash of the local zip file
      readFileSyncStub.returns(new Buffer('my-service.zip content'));

      return awsDeployFunction.deployFunction().then(() => {
        const expected = 'Uploading function: first (1 KB)...';

        expect(readFileSyncStub.calledOnce).to.equal(true);
        expect(statSyncStub.calledOnce).to.equal(true);
        expect(awsDeployFunction.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);
        expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
      });
    });

    describe('when artifact is provided', () => {
      let getFunctionStub;
      const artifactZipFile = 'artifact.zip';

      beforeEach(() => {
        getFunctionStub = sinon.stub(serverless.service, 'getFunction').returns({
          handler: true,
          package: {
            artifact: artifactZipFile,
          },
        });
      });

      afterEach(() => {
        serverless.service.getFunction.restore();
      });

      it('should read the provided artifact', () => awsDeployFunction.deployFunction().then(() => {
        const data = fs.readFileSync(artifactZipFile);

        expect(readFileSyncStub).to.have.been.calledWithExactly(artifactZipFile);
        expect(statSyncStub).to.have.been.calledWithExactly(artifactZipFile);
        expect(getFunctionStub).to.have.been.calledWithExactly('first');
        expect(updateFunctionCodeStub.calledOnce).to.equal(true);
        expect(updateFunctionCodeStub.calledWithExactly(
          'Lambda',
          'updateFunctionCode',
          {
            FunctionName: 'first',
            ZipFile: data,
          }
        )).to.be.equal(true);
      }));
    });
  });
});
