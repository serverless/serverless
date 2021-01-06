'use strict';
/* eslint-disable no-unused-expressions */
const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const proxyquire = require('proxyquire');
const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../lib/Serverless');
const { getTmpDirPath } = require('../../../../utils/fs');
const runServerless = require('../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('AwsDeployFunction', () => {
  let AwsDeployFunction;
  let serverless;
  let awsDeployFunction;
  let cryptoStub;

  beforeEach(async () => {
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
    await serverless.init();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    cryptoStub = {
      createHash() {
        return this;
      }, // eslint-disable-line
      update() {
        return this;
      }, // eslint-disable-line
      digest: sinon.stub(),
    };
    AwsDeployFunction = proxyquire('../../../../../lib/plugins/aws/deployFunction', {
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

    it("should update function's configuration", async () => {
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
        layers: ['arn:aws:lambda:us-east-1:123456789012:layer:layer:1'],
      };

      awsDeployFunction.options = options;

      await awsDeployFunction.updateFunctionConfiguration();

      expect(normalizeArnRoleStub.calledOnce).to.be.equal(true);
      expect(normalizeArnRoleStub.calledWithExactly('arn:aws:iam::123456789012:role/Admin'));
      expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
      expect(
        updateFunctionConfigurationStub.calledWithExactly('Lambda', 'updateFunctionConfiguration', {
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
          Layers: ['arn:aws:lambda:us-east-1:123456789012:layer:layer:1'],
        })
      ).to.be.equal(true);
    });

    it('should update only specified params', async () => {
      options.functionObj = {
        name: 'first',
        description: 'change',
        vpc: undefined,
      };

      awsDeployFunction.options = options;

      await awsDeployFunction.updateFunctionConfiguration();
      expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
      expect(
        updateFunctionConfigurationStub.calledWithExactly('Lambda', 'updateFunctionConfiguration', {
          FunctionName: 'first',
          Description: 'change',
        })
      ).to.be.equal(true);
    });

    it('should skip elements that contain references', async () => {
      options.functionObj = {
        name: 'first',
        description: 'change',
        handler: 'my_handler',
        vpc: {
          securityGroupIds: [
            'xxxxx',
            {
              ref: 'myVPCRef',
            },
          ],
          subnetIds: [
            'xxxxx',
            {
              ref: 'myVPCRef',
            },
          ],
        },
        environment: {
          myvar: 'this is my var',
          myref: {
            ref: 'aCFReference',
          },
        },
      };

      awsDeployFunction.options = options;

      await awsDeployFunction.updateFunctionConfiguration();
      expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
      expect(
        updateFunctionConfigurationStub.calledWithExactly('Lambda', 'updateFunctionConfiguration', {
          FunctionName: 'first',
          Handler: 'my_handler',
          Description: 'change',
        })
      ).to.be.equal(true);
    });

    it('should do nothing if only references are in', async () => {
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
      await expect(awsDeployFunction.updateFunctionConfiguration()).to.be.fulfilled;

      expect(updateFunctionConfigurationStub).to.not.be.called;
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

      return expect(awsDeployFunction.updateFunctionConfiguration()).to.eventually.be.rejected;
    });

    it('should transform to string values when using non-string values as environment variables', async () => {
      options.functionObj = {
        name: 'first',
        handler: 'my_handler',
        description: 'change',
        environment: {
          COUNTER: 6,
        },
      };

      awsDeployFunction.options = options;
      await expect(awsDeployFunction.updateFunctionConfiguration()).to.be.fulfilled;

      expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
      expect(
        updateFunctionConfigurationStub.calledWithExactly('Lambda', 'updateFunctionConfiguration', {
          FunctionName: 'first',
          Handler: 'my_handler',
          Description: 'change',
          Environment: {
            Variables: {
              COUNTER: '6',
            },
          },
        })
      ).to.be.equal(true);
    });

    it('should inherit provider-level config', async () => {
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

      await awsDeployFunction.updateFunctionConfiguration();

      expect(normalizeArnRoleStub.calledOnce).to.be.equal(true);
      expect(normalizeArnRoleStub.calledWithExactly('role'));
      expect(updateFunctionConfigurationStub.calledOnce).to.be.equal(true);
      expect(
        updateFunctionConfigurationStub.calledWithExactly('Lambda', 'updateFunctionConfiguration', {
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
        })
      ).to.be.equal(true);
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
      sinon.spy(awsDeployFunction.serverless.cli, 'log');
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

      const expected = 'Code not changed. Skipping function deployment.';

      expect(updateFunctionCodeStub.calledOnce).to.be.equal(false);
      expect(readFileSyncStub.calledOnce).to.equal(true);
      expect(awsDeployFunction.serverless.cli.log.calledWithExactly(expected)).to.equal(true);
      expect(readFileSyncStub.calledWithExactly(artifactFilePath)).to.equal(true);
    });

    it('should log artifact size', async () => {
      // awnY7Oi280gp5kTCloXzsqJCO4J766x6hATWqQsN/uM= <-- hash of the local zip file
      readFileSyncStub.returns(Buffer.from('my-service.zip content'));

      await awsDeployFunction.deployFunction();

      const expected = 'Uploading function: first (1 KB)...';
      expect(readFileSyncStub.calledOnce).to.equal(true);
      expect(statSyncStub.calledOnce).to.equal(true);
      expect(awsDeployFunction.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);
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

describe('AwsDeployFunction - runServerless', () => {
  describe('when ecr is used', () => {
    const awsRequestStubMap = {
      Lambda: {
        getFunction: {
          Configuration: {
            LastModified: '2020-05-20T15:34:16.494+0000',
          },
        },
      },
    };

    it('should fail if `functions[].image` references image without path and uri', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          cliArgs: ['deploy', 'function', '-f', 'fnProviderInvalidImage'],
          awsRequestStubMap,
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
      ).to.be.rejectedWith(
        'Either "uri" or "path" property needs to be set on image "invalidimage"'
      );
    });

    it('should fail if `functions[].image` references image with both path and uri', async () => {
      await expect(
        runServerless({
          fixture: 'function',
          cliArgs: ['deploy', 'function', '-f', 'fnProviderInvalidImage'],
          awsRequestStubMap,
          configExt: {
            provider: {
              ecr: {
                images: {
                  invalidimage: {
                    path: './',
                    uri:
                      '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
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
      ).to.be.rejectedWith(
        'Either "uri" or "path" property (not both) needs to be set on image "invalidimage"'
      );
    });

    describe('with `provider.ecr.images` that require building', () => {
      const imageSha = '6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38';
      const repositoryUri = '999999999999.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker';
      const authorizationToken = 'dGVzdC1kb2NrZXI=';
      const proxyEndpoint = `https://${repositoryUri}`;
      const describeRepositoriesStub = sinon.stub();
      const createRepositoryStub = sinon.stub();
      const updateFunctionCodeStub = sinon.stub();
      const baseAwsRequestStubMap = {
        Lambda: {
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
            },
          },
          updateFunctionCode: updateFunctionCodeStub,
        },
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
                proxyEndpoint: `https://${repositoryUri}`,
                authorizationToken,
              },
            ],
          },
        },
      };
      const spawnExtStub = sinon.stub().returns({
        child: {
          stdin: {
            write: () => {},
            end: () => {},
          },
        },
        stdBuffer: `digest: sha256:${imageSha} size: 1787`,
      });
      const modulesCacheStub = {
        'child-process-ext/spawn': spawnExtStub,
      };

      beforeEach(() => {
        describeRepositoriesStub.reset();
        createRepositoryStub.reset();
        spawnExtStub.resetHistory();
        updateFunctionCodeStub.resetHistory();
      });

      it('should work correctly when repository exists beforehand', async () => {
        const overrideAwsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        const { awsNaming } = await runServerless({
          fixture: 'ecr',
          cliArgs: ['deploy', 'function', '-f', 'foo'],
          awsRequestStubMap: overrideAwsRequestStubMap,
          modulesCacheStub,
        });

        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(updateFunctionCodeStub).to.be.calledOnce;
        expect(updateFunctionCodeStub.args[0][0].ImageUri).to.equal(
          `${repositoryUri}@sha256:${imageSha}`
        );
        expect(spawnExtStub).to.be.calledWith('docker', ['--version']);
        expect(spawnExtStub).to.be.calledWith('docker', [
          'login',
          '--username',
          'AWS',
          '--password-stdin',
          proxyEndpoint,
        ]);
        expect(spawnExtStub).to.be.calledWith('docker', [
          'build',
          '-t',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          './',
        ]);
        expect(spawnExtStub).to.be.calledWith('docker', [
          'tag',
          `${awsNaming.getEcrRepositoryName()}:baseimage`,
          `${repositoryUri}:baseimage`,
        ]);
        expect(spawnExtStub).to.be.calledWith('docker', ['push', `${repositoryUri}:baseimage`]);
      });

      it('should work correctly when repository does not exist beforehand', async () => {
        const overrideAwsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.throws({
              providerError: { code: 'RepositoryNotFoundException' },
            }),
            createRepository: createRepositoryStub.resolves({ repository: { repositoryUri } }),
          },
        };

        await runServerless({
          fixture: 'ecr',
          cliArgs: ['deploy', 'function', '-f', 'foo'],
          awsRequestStubMap: overrideAwsRequestStubMap,
          modulesCacheStub,
        });

        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub).to.be.calledOnce;
        expect(updateFunctionCodeStub).to.be.calledOnce;
        expect(updateFunctionCodeStub.args[0][0].ImageUri).to.equal(
          `${repositoryUri}@sha256:${imageSha}`
        );
      });

      it('should work correctly when image is defined with implicit path in provider', async () => {
        const overrideAwsRequestStubMap = {
          ...baseAwsRequestStubMap,
          ECR: {
            ...baseAwsRequestStubMap.ECR,
            describeRepositories: describeRepositoriesStub.resolves({
              repositories: [{ repositoryUri }],
            }),
            createRepository: createRepositoryStub,
          },
        };
        await runServerless({
          fixture: 'ecr',
          cliArgs: ['deploy', 'function', '-f', 'foo'],
          awsRequestStubMap: overrideAwsRequestStubMap,
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

        expect(describeRepositoriesStub).to.be.calledOnce;
        expect(createRepositoryStub.notCalled).to.be.true;
        expect(updateFunctionCodeStub).to.be.calledOnce;
        expect(updateFunctionCodeStub.args[0][0].ImageUri).to.equal(
          `${repositoryUri}@sha256:${imageSha}`
        );
      });

      it('should fail when docker command is not available', async () => {
        await expect(
          runServerless({
            fixture: 'ecr',
            cliArgs: ['deploy', 'function', '-f', 'foo'],
            awsRequestStubMap: baseAwsRequestStubMap,
            modulesCacheStub: {
              'child-process-ext/spawn': sinon.stub().throws(),
            },
          })
        ).to.be.rejectedWith(
          'Could not find Docker installation. Ensure Docker is installed before continuing.'
        );
      });
    });
  });
});
