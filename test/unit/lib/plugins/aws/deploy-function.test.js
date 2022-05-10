'use strict';
/* eslint-disable no-unused-expressions */
const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const proxyquire = require('proxyquire');
const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../lib/serverless');
const runServerless = require('../../../../utils/run-serverless');
const { getTmpDirPath } = require('../../../../utils/fs');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('AwsDeployFunction', () => {
  let AwsDeployFunction;
  let serverless;
  let awsDeployFunction;
  let cryptoStub;

  beforeEach(async () => {
    serverless = new Serverless({ commands: ['print'], options: {}, serviceDir: null });
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
    serverless.service.serviceObject = {};
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
    await serverless.init();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    cryptoStub = {
      createHash() {
        return this;
      },
      update() {
        return this;
      },
      digest: sinon.stub(),
    };
    AwsDeployFunction = proxyquire('../../../../../lib/plugins/aws/deploy-function', {
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

    it('it should throw error if function is not provided', async () => {
      serverless.service.functions = {};
      await expect(awsDeployFunction.checkIfFunctionExists()).to.eventually.be.rejected;
    });

    it('should check if the function is deployed and save the result', async () => {
      awsDeployFunction.serverless.service.functions = {
        first: {
          name: 'first',
          handler: 'handler.first',
        },
      };

      await awsDeployFunction.checkIfFunctionExists();

      expect(getFunctionStub.calledOnce).to.be.equal(true);
      expect(
        getFunctionStub.calledWithExactly('Lambda', 'getFunction', {
          FunctionName: 'first',
        })
      ).to.be.equal(true);
      expect(awsDeployFunction.serverless.service.provider.remoteFunctionData).to.deep.equal({
        func: {
          name: 'first',
        },
      });
    });
  });

  describe('#normalizeArnRole', () => {
    let getAccountInfoStub;
    let getRoleStub;

    beforeEach(() => {
      // Ensure that memoized function will be properly stubbed
      awsDeployFunction.provider.getAccountInfo;
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

    it('should return unmodified ARN if ARN was provided', async () => {
      const arn = 'arn:aws:iam::123456789012:role/role';

      const result = await awsDeployFunction.normalizeArnRole(arn);

      expect(getAccountInfoStub).to.not.have.been.called;
      expect(result).to.be.equal(arn);
    });

    it('should return compiled ARN if role name was provided', async () => {
      const roleName = 'MyCustomRole';

      const result = await awsDeployFunction.normalizeArnRole(roleName);

      expect(getAccountInfoStub).to.have.been.called;
      expect(result).to.be.equal('arn:aws:iam::123456789012:role/role_123');
    });

    it('should return compiled ARN if object role was provided', async () => {
      const roleObj = {
        'Fn::GetAtt': ['role_2', 'Arn'],
      };

      const result = await awsDeployFunction.normalizeArnRole(roleObj);

      expect(getRoleStub.calledOnce).to.be.equal(true);
      expect(getAccountInfoStub).to.not.have.been.called;
      expect(result).to.be.equal('arn:aws:iam::123456789012:role/role_2');
    });
  });

  describe('#deployFunction()', () => {
    let artifactFilePath;
    let updateFunctionCodeStub;
    let statSyncStub;
    let readFileSyncStub;

    beforeEach(() => {
      // write a file to disc to simulate that the deployment artifact exists
      awsDeployFunction.packagePath = getTmpDirPath();
      artifactFilePath = path.join(awsDeployFunction.packagePath, 'first.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'first.zip file content');
      updateFunctionCodeStub = sinon.stub(awsDeployFunction.provider, 'request').resolves();
      statSyncStub = sinon.stub(fs, 'statSync').returns({ size: 1024 });
      readFileSyncStub = sinon.stub(fs, 'readFileSync').returns();
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

    it('should deploy the function if the hashes are different', async () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('local-hash-zip-file');

      await awsDeployFunction.deployFunction();

      const data = fs.readFileSync(artifactFilePath);
      expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
      expect(readFileSyncStub.called).to.equal(true);
      expect(
        updateFunctionCodeStub.calledWithExactly('Lambda', 'updateFunctionCode', {
          FunctionName: 'first',
          ZipFile: data,
        })
      ).to.be.equal(true);
      expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
    });

    it('should deploy the function if the hashes are same but the "force" option is used', async () => {
      awsDeployFunction.options.force = true;
      cryptoStub.createHash().update().digest.onCall(0).returns('remote-hash-zip-file');

      await awsDeployFunction.deployFunction();
      const data = fs.readFileSync(artifactFilePath);

      expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
      expect(readFileSyncStub.called).to.equal(true);
      expect(
        updateFunctionCodeStub.calledWithExactly('Lambda', 'updateFunctionCode', {
          FunctionName: 'first',
          ZipFile: data,
        })
      ).to.be.equal(true);
      expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
    });

    it('should resolve if the hashes are the same', async () => {
      cryptoStub.createHash().update().digest.onCall(0).returns('remote-hash-zip-file');

      await awsDeployFunction.deployFunction();

      expect(updateFunctionCodeStub.calledOnce).to.be.equal(false);
      expect(readFileSyncStub.calledOnce).to.equal(true);
      expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
    });

    it('should log artifact size', async () => {
      // awnY7Oi280gp5kTCloXzsqJCO4J766x6hATWqQsN/uM= <-- hash of the local zip file
      readFileSyncStub.returns(Buffer.from('my-service.zip content'));

      await awsDeployFunction.deployFunction();

      expect(readFileSyncStub.calledOnce).to.equal(true);
      expect(statSyncStub.calledOnce).to.equal(true);
      expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
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

      it('should read the provided artifact', async () => {
        await awsDeployFunction.deployFunction();

        const data = fs.readFileSync(artifactZipFile);

        expect(readFileSyncStub).to.have.been.calledWithExactly(artifactZipFile);
        expect(statSyncStub).to.have.been.calledWithExactly(artifactZipFile);
        expect(getFunctionStub).to.have.been.calledWithExactly('first');
        expect(updateFunctionCodeStub.calledOnce).to.equal(true);
        expect(
          updateFunctionCodeStub.calledWithExactly('Lambda', 'updateFunctionCode', {
            FunctionName: 'first',
            ZipFile: data,
          })
        ).to.be.equal(true);
      });
    });
  });
});

describe('test/unit/lib/plugins/aws/deployFunction.test.js', () => {
  const kmsKeyArn = 'arn:aws:kms:us-east-1:123456789012';
  const description = 'func description';
  const handler = 'funcHandler';
  const functionName = 'funcName';
  const memorySize = 255;
  const onErrorHandler = 'arn:aws:sns:us-east-1:123456789012:onerror';
  const timeout = 50;
  const layerArn = 'arn:aws:lambda:us-east-1:123456789012:layer:layer:1';
  const secondLayerArn = 'arn:aws:lambda:us-east-1:123456789012:layer:layer:2';
  const role = 'arn:aws:iam::123456789012:role/Admin';
  const imageSha = '6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38';
  const imageWithSha = `000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:${imageSha}`;
  const updateFunctionCodeStub = sinon.stub();
  const updateFunctionConfigurationStub = sinon.stub();
  const awsRequestStubMap = {
    Lambda: {
      getFunction: {
        Configuration: {
          LastModified: '2020-05-20T15:34:16.494+0000',
          State: 'Active',
          LastUpdateStatus: 'Successful',
        },
      },
      updateFunctionCode: updateFunctionCodeStub,
      updateFunctionConfiguration: updateFunctionConfigurationStub,
    },
    STS: {
      getCallerIdentity: {
        ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
        UserId: 'XXXXXXXXXXXXXXXXXXXXX',
        Account: '999999999999',
        Arn: 'arn:aws:iam::999999999999:user/test',
      },
    },
  };

  beforeEach(() => {
    updateFunctionCodeStub.resetHistory();
    updateFunctionConfigurationStub.resetHistory();
  });

  // This is just a happy-path test of images support. Due to sharing code from `provider.js`
  // all further configurations are tested as a part of `test/unit/lib/plugins/aws/provider.test.js`
  it('should support deploying function that has image defined with sha', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'foo' },
      awsRequestStubMap,
      configExt: {
        functions: {
          foo: {
            image: imageWithSha,
          },
        },
      },
    });
    expect(updateFunctionCodeStub).to.be.calledOnce;
    expect(updateFunctionCodeStub.args[0][0].ImageUri).to.equal(imageWithSha);
  });

  it('should support updating function with image config', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'foo' },
      awsRequestStubMap,
      configExt: {
        functions: {
          foo: {
            image: {
              uri: imageWithSha,
              workingDirectory: './workdir',
              entryPoint: ['executable', 'param1'],
              command: ['anotherexecutable'],
            },
          },
        },
      },
    });
    expect(updateFunctionCodeStub).to.be.calledOnce;
    expect(updateFunctionCodeStub.args[0][0].ImageUri).to.equal(imageWithSha);
    expect(updateFunctionConfigurationStub).to.be.calledOnce;
    expect(updateFunctionConfigurationStub.args[0][0].ImageConfig).to.deep.equal({
      Command: ['anotherexecutable'],
      EntryPoint: ['executable', 'param1'],
      WorkingDirectory: './workdir',
    });
  });

  it('should skip updating function configuration if image config did not change', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
              CodeSha256: imageSha,
              State: 'Active',
              LastUpdateStatus: 'Successful',

              ImageConfigResponse: {
                ImageConfig: {
                  Command: ['anotherexecutable'],
                  EntryPoint: ['executable', 'param1'],
                  WorkingDirectory: './workdir',
                },
              },
            },
          },
        },
      },
      configExt: {
        functions: {
          basic: {
            handler: null,
            image: {
              uri: imageWithSha,
              workingDirectory: './workdir',
              entryPoint: ['executable', 'param1'],
              command: ['anotherexecutable'],
            },
          },
        },
      },
    });
    expect(updateFunctionConfigurationStub).not.to.be.called;
  });

  it('should skip deployment if image sha did not change', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
              CodeSha256: imageSha,
              State: 'Active',
              LastUpdateStatus: 'Successful',
            },
          },
        },
      },
      configExt: {
        functions: {
          basic: {
            image: imageWithSha,
          },
        },
      },
    });
    expect(updateFunctionCodeStub).not.to.be.called;
  });

  it('should fail if function with image was previously defined with handler', async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy function',
        options: { function: 'basic' },
        awsRequestStubMap: {
          ...awsRequestStubMap,
          Lambda: {
            ...awsRequestStubMap.Lambda,
            getFunction: {
              Configuration: {
                LastModified: '2020-05-20T15:34:16.494+0000',
                PackageType: 'Zip',
                State: 'Active',
                LastUpdateStatus: 'Successful',
              },
            },
          },
        },
        configExt: {
          functions: {
            basic: {
              image: imageWithSha,
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property(
      'code',
      'DEPLOY_FUNCTION_CHANGE_BETWEEN_HANDLER_AND_IMAGE_ERROR'
    );
  });

  it('should fail if function with image was previously defined with handler', async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy function',
        options: { function: 'basic' },
        awsRequestStubMap: {
          ...awsRequestStubMap,
          Lambda: {
            ...awsRequestStubMap.Lambda,
            getFunction: {
              Configuration: {
                LastModified: '2020-05-20T15:34:16.494+0000',
                PackageType: 'Image',
                State: 'Active',
                LastUpdateStatus: 'Successful',
              },
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property(
      'code',
      'DEPLOY_FUNCTION_CHANGE_BETWEEN_HANDLER_AND_IMAGE_ERROR'
    );
  });

  it('should handle retry when `updateFunctionConfiguration` returns `ResourceConflictException` error', async () => {
    const innerUpdateFunctionConfigurationStub = sinon
      .stub()
      .onFirstCall()
      .throws({ providerError: { code: 'ResourceConflictException' } })
      .onSecondCall()
      .resolves({});
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          updateFunctionConfiguration: innerUpdateFunctionConfigurationStub,
        },
      },
      modulesCacheStub: {
        'timers-ext/promise/sleep': sinon.stub().returns({}),
      },
      configExt: {
        functions: {
          basic: {
            timeout: 50,
          },
        },
      },
    });

    expect(innerUpdateFunctionConfigurationStub.callCount).to.equal(2);
  });

  it('should update function configuration if configuration changed', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
              PackageType: 'Zip',
              State: 'Active',
              LastUpdateStatus: 'Successful',
            },
          },
        },
      },
      configExt: {
        provider: {
          environment: {
            ANOTHERVAR: 'anothervalue',
          },
        },
        functions: {
          basic: {
            kmsKeyArn,
            description,
            handler,
            environment: {
              VARIABLE: 'value',
            },
            name: functionName,
            memorySize,
            onError: onErrorHandler,
            role,
            timeout,
            vpc: {
              securityGroupIds: ['sg-111', 'sg-222'],
              subnetIds: ['subnet-111', 'subnet-222'],
            },
            layers: [layerArn, secondLayerArn],
          },
        },
      },
    });

    expect(updateFunctionConfigurationStub).to.be.calledWithExactly({
      FunctionName: functionName,
      KMSKeyArn: kmsKeyArn,
      Description: description,
      Handler: handler,
      Environment: {
        Variables: {
          ANOTHERVAR: 'anothervalue',
          VARIABLE: 'value',
        },
      },
      MemorySize: memorySize,
      Timeout: timeout,
      DeadLetterConfig: {
        TargetArn: onErrorHandler,
      },
      Role: role,
      VpcConfig: {
        SecurityGroupIds: ['sg-111', 'sg-222'],
        SubnetIds: ['subnet-111', 'subnet-222'],
      },
      Layers: [layerArn, secondLayerArn],
    });
  });

  it('should skip updating properties that contain references', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
              PackageType: 'Zip',
              State: 'Active',
              LastUpdateStatus: 'Successful',
            },
          },
        },
      },
      configExt: {
        functions: {
          basic: {
            name: functionName,
            role,
            timeout,
            vpc: {
              securityGroupIds: ['sg-111', { Ref: 'mySGRef' }],
              subnetIds: ['subnet-111', 'subnet-222'],
            },
            environment: {
              VARIABLE: {
                Ref: 'SomeReference',
              },
            },
          },
        },
      },
    });

    expect(updateFunctionConfigurationStub).to.be.calledWithExactly({
      FunctionName: functionName,
      Handler: 'basic.handler',
      Timeout: timeout,
      VpcConfig: {
        SubnetIds: ['subnet-111', 'subnet-222'],
      },
      Role: role,
    });
  });

  it('should update function configuration with provider-level properties', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
              PackageType: 'Zip',
              State: 'Active',
              LastUpdateStatus: 'Successful',
            },
          },
        },
      },
      configExt: {
        provider: {
          environment: {
            ANOTHERVAR: 'anothervalue',
            VARIABLE: 'value',
          },
          memorySize,
          iam: { role },
          timeout,
          vpc: {
            securityGroupIds: ['sg-111', 'sg-222'],
            subnetIds: ['subnet-111', 'subnet-222'],
          },
        },
        functions: {
          basic: {
            name: functionName,
          },
        },
      },
    });

    expect(updateFunctionConfigurationStub).to.be.calledWithExactly({
      FunctionName: functionName,
      Handler: 'basic.handler',
      Environment: {
        Variables: {
          ANOTHERVAR: 'anothervalue',
          VARIABLE: 'value',
        },
      },
      MemorySize: memorySize,
      Timeout: timeout,
      Role: role,
      VpcConfig: {
        SecurityGroupIds: ['sg-111', 'sg-222'],
        SubnetIds: ['subnet-111', 'subnet-222'],
      },
    });
  });

  it('should not update function configuration if configuration did not change', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
              PackageType: 'Zip',
              KMSKeyArn: kmsKeyArn,
              Description: description,
              Handler: handler,
              State: 'Active',
              LastUpdateStatus: 'Successful',

              Environment: {
                Variables: {
                  ANOTHERVAR: 'anothervalue',
                  VARIABLE: 'value',
                },
              },
              FunctionName: functionName,
              MemorySize: memorySize,
              DeadLetterConfig: {
                TargetArn: onErrorHandler,
              },
              Timeout: timeout,
              Layers: [{ Arn: secondLayerArn }, { Arn: layerArn }],
              Role: role,
              VpcConfig: {
                VpcId: 'vpc-xxxx',
                SecurityGroupIds: ['sg-111', 'sg-222'],
                SubnetIds: ['subnet-222', 'subnet-111'],
              },
            },
          },
        },
      },
      configExt: {
        provider: {
          environment: {
            ANOTHERVAR: 'anothervalue',
          },
        },
        functions: {
          basic: {
            kmsKeyArn,
            description,
            handler,
            environment: {
              VARIABLE: 'value',
            },
            name: functionName,
            memorySize,
            onError: onErrorHandler,
            role,
            timeout,
            vpc: {
              securityGroupIds: ['sg-111', 'sg-222'],
              subnetIds: ['subnet-111', 'subnet-222'],
            },
            layers: [layerArn, secondLayerArn],
          },
        },
      },
    });

    expect(updateFunctionConfigurationStub).not.to.be.called;
  });

  it('configuration uses `provider.kmsKeyArn` if no `kmsKeyArn` provided on function level', async () => {
    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      lastLifecycleHookName: 'deploy:function:deploy',
      awsRequestStubMap,
      configExt: {
        provider: {
          kmsKeyArn: 'arn:aws:kms:us-east-1:oldKey',
        },
        functions: {
          basic: {
            handler: 'index.handler',
            name: 'foobar',
          },
        },
      },
    });

    sinon.assert.calledWith(updateFunctionConfigurationStub, {
      Handler: 'index.handler',
      FunctionName: 'foobar',
      KMSKeyArn: 'arn:aws:kms:us-east-1:oldKey',
    });
  });

  it("should surface request error if it's not about function not being found", async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy function',
        options: { function: 'basic' },
        lastLifecycleHookName: 'deploy:function:deploy',
        awsRequestStubMap: {
          ...awsRequestStubMap,
          Lambda: {
            ...awsRequestStubMap.Lambda,
            getFunction: () => {
              throw new Error('Some side error');
            },
          },
        },
      })
    ).to.be.eventually.rejectedWith('Some side error');
  });

  it('should surface meaningful error if function is not yet deployed', async () => {
    await expect(
      runServerless({
        fixture: 'function',
        command: 'deploy function',
        options: { function: 'basic' },
        lastLifecycleHookName: 'deploy:function:deploy',
        awsRequestStubMap: {
          ...awsRequestStubMap,
          Lambda: {
            ...awsRequestStubMap.Lambda,
            getFunction: () => {
              throw Object.assign(new Error('Function not found'), {
                providerError: {
                  code: 'ResourceNotFoundException',
                },
              });
            },
          },
        },
      })
    ).to.be.eventually.rejected.and.have.property('code', 'FUNCTION_NOT_YET_DEPLOYED');
  });

  it('should handle situation where function is not immediately in desired state', async () => {
    const successResponse = {
      Configuration: {
        LastModified: '2020-05-20T15:34:16.494+0000',
        State: 'Active',
        LastUpdateStatus: 'Successful',
      },
    };

    const getFunctionStub = sinon
      .stub()
      .resolves(successResponse)
      .onCall(1)
      .resolves({
        Configuration: {
          LastModified: '2020-05-20T15:34:16.494+0000',
          State: 'Active',
          LastUpdateStatus: 'InProgress',
        },
      })
      .onCall(2)
      .resolves(successResponse);

    await runServerless({
      fixture: 'function',
      command: 'deploy function',
      options: { function: 'basic' },
      lastLifecycleHookName: 'deploy:function:deploy',
      awsRequestStubMap: {
        ...awsRequestStubMap,
        Lambda: {
          ...awsRequestStubMap.Lambda,
          getFunction: getFunctionStub,
        },
      },
    });
    expect(getFunctionStub).to.have.been.calledThrice;
  });
});
