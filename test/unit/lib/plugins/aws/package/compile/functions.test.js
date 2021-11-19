'use strict';

const AWS = require('aws-sdk');
const fse = require('fs-extra');
const fsp = require('fs').promises;
const _ = require('lodash');
const path = require('path');
const chai = require('chai');
const sinon = require('sinon');
const AwsProvider = require('../../../../../../../lib/plugins/aws/provider');
const AwsCompileFunctions = require('../../../../../../../lib/plugins/aws/package/compile/functions');
const Serverless = require('../../../../../../../lib/Serverless');
const runServerless = require('../../../../../../utils/run-serverless');
const fixtures = require('../../../../../../fixtures/programmatic');
const getHashForFilePath = require('../../../../../../../lib/plugins/aws/package/lib/getHashForFilePath');

const { getTmpDirPath, createTmpFile } = require('../../../../../../utils/fs');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('AwsCompileFunctions', () => {
  let serverless;
  let awsProvider;
  let awsCompileFunctions;
  const functionName = 'test';
  const compiledFunctionName = 'TestLambdaFunction';

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      commands: [],
      options: {},
    };
    serverless = new Serverless(options);
    awsProvider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', awsProvider);
    serverless.service.provider.name = 'aws';
    serverless.cli = new serverless.classes.CLI();
    awsCompileFunctions = new AwsCompileFunctions(serverless, options);
    awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };

    const serviceArtifact = 'new-service.zip';
    const individualArtifact = 'test.zip';
    awsCompileFunctions.packagePath = getTmpDirPath();
    // The contents of the test artifacts need to be predictable so the hashes stay the same
    serverless.utils.writeFileSync(
      path.join(awsCompileFunctions.packagePath, serviceArtifact),
      'foobar'
    );
    serverless.utils.writeFileSync(
      path.join(awsCompileFunctions.packagePath, individualArtifact),
      'barbaz'
    );

    awsCompileFunctions.serverless.service.service = 'new-service';
    awsCompileFunctions.serverless.service.package.artifactDirectoryName = 'somedir';
    awsCompileFunctions.serverless.service.package.artifact = path.join(
      awsCompileFunctions.packagePath,
      serviceArtifact
    );
    awsCompileFunctions.serverless.service.functions = {};
    awsCompileFunctions.serverless.service.functions[functionName] = {
      name: 'test',
      package: {
        artifact: path.join(awsCompileFunctions.packagePath, individualArtifact),
      },
      handler: 'handler.hello',
    };
  });

  describe('#downloadPackageArtifacts()', () => {
    let requestStub;
    let testFilePath;
    const s3BucketName = 'test-bucket';
    const s3ArtifactName = 's3-hosted-artifact.zip';

    beforeEach(() => {
      testFilePath = createTmpFile('dummy-artifact');
      requestStub = sinon.stub(AWS, 'S3').returns({
        getObject: () => ({
          createReadStream() {
            return fse.createReadStream(testFilePath);
          },
        }),
      });
    });

    afterEach(() => {
      AWS.S3.restore();
    });

    it('should download the file and replace the artifact path for function packages', () => {
      awsCompileFunctions.serverless.service.package.individually = true;
      awsCompileFunctions.serverless.service.functions[
        functionName
      ].package.artifact = `https://s3.amazonaws.com/${s3BucketName}/${s3ArtifactName}`;

      return expect(awsCompileFunctions.downloadPackageArtifacts()).to.be.fulfilled.then(() => {
        const artifactFileName = awsCompileFunctions.serverless.service.functions[
          functionName
        ].package.artifact
          .split(path.sep)
          .pop();

        expect(requestStub.callCount).to.equal(1);
        expect(artifactFileName).to.equal(s3ArtifactName);
      });
    });

    it('should download the file and replace the artifact path for service-wide packages', () => {
      awsCompileFunctions.serverless.service.package.individually = false;
      awsCompileFunctions.serverless.service.functions[functionName].package.artifact = false;
      awsCompileFunctions.serverless.service.package.artifact = `https://s3.amazonaws.com/${s3BucketName}/${s3ArtifactName}`;

      return expect(awsCompileFunctions.downloadPackageArtifacts()).to.be.fulfilled.then(() => {
        const artifactFileName = awsCompileFunctions.serverless.service.package.artifact
          .split(path.sep)
          .pop();

        expect(requestStub.callCount).to.equal(1);
        expect(artifactFileName).to.equal(s3ArtifactName);
      });
    });

    it('should not access AWS.S3 if URL is not an S3 URl', () => {
      AWS.S3.restore();
      const myRequestStub = sinon.stub(AWS, 'S3').returns({
        getObject: () => {
          throw new Error('should not be invoked');
        },
      });
      awsCompileFunctions.serverless.service.functions[functionName].package.artifact =
        'https://s33amazonaws.com/this/that';
      return expect(awsCompileFunctions.downloadPackageArtifacts()).to.be.fulfilled.then(() => {
        expect(myRequestStub.callCount).to.equal(1);
      });
    });
  });

  describe('#compileFunctions()', () => {
    it('should use function artifact if individually', () => {
      awsCompileFunctions.serverless.service.package.individually = true;

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        const functionResource =
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            compiledFunctionName
          ];

        const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        const s3FileName = awsCompileFunctions.serverless.service.functions[
          functionName
        ].package.artifact
          .split(path.sep)
          .pop();

        expect(functionResource.Properties.Code.S3Key).to.deep.equal(`${s3Folder}/${s3FileName}`);
      });
    });

    it('should add an ARN function role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: 'arn:aws:xxx:*:*',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Role
        ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func.role);
      });
    });

    it('should honour provider.iam.role option when set', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 'function',
        configExt: {
          disabledDeprecations: ['PROVIDER_IAM_SETTINGS'],
          provider: {
            role: 'role-a',
            iam: { role: 'role-b' },
          },
        },
        command: 'package',
      });

      expect(cfTemplate.Resources.BasicLambdaFunction.Properties.Role).to.eql({
        'Fn::GetAtt': ['role-b', 'Arn'],
      });
    });

    it('should add a logical role name function role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: 'LogicalRoleName',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup', 'LogicalRoleName']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Role
        ).to.deep.equal({
          'Fn::GetAtt': [awsCompileFunctions.serverless.service.functions.func.role, 'Arn'],
        });
      });
    });

    it('should add a "Fn::GetAtt" Object function role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: {
            'Fn::GetAtt': ['LogicalRoleName', 'Arn'],
          },
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup', 'LogicalRoleName']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Role
        ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func.role);
      });
    });

    it('should add a "Fn::ImportValue" Object function role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: {
            'Fn::ImportValue': 'Foo',
          },
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Role
        ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func.role);
      });
    });

    it('should add function declared roles', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func0',
          role: 'arn:aws:xx0:*:*',
        },
        func1: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func1',
          role: 'arn:aws:xx1:*:*',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Func0LambdaFunction.DependsOn
        ).to.deep.equal(['Func0LogGroup']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Func0LambdaFunction.Properties.Role
        ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func0.role);

        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Func1LambdaFunction.DependsOn
        ).to.deep.equal(['Func1LogGroup']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Func1LambdaFunction.Properties.Role
        ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func1.role);
      });
    });

    it('should create a simple function resource', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: ['FuncLogGroup'],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs14.x',
          Timeout: 6,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    describe('when using onError config', () => {
      let s3Folder;
      let s3FileName;

      beforeEach(() => {
        s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        s3FileName = awsCompileFunctions.serverless.service.package.artifact.split(path.sep).pop();
      });

      describe('when IamRoleLambdaExecution is used', () => {
        beforeEach(() => {
          // pretend that the IamRoleLambdaExecution is used
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
            {
              Properties: {
                Policies: [
                  {
                    PolicyDocument: {
                      Statement: [],
                    },
                  },
                ],
              },
            };
        });

        it('should create necessary resources if a SNS arn is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              onError: 'arn:aws:sns:region:accountid:foo',
            },
          };

          const compiledFunction = {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['FuncLogGroup'],
            Properties: {
              Code: {
                S3Key: `${s3Folder}/${s3FileName}`,
                S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              },
              FunctionName: 'new-service-dev-func',
              Handler: 'func.function.handler',
              MemorySize: 1024,
              Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
              Runtime: 'nodejs14.x',
              Timeout: 6,
              DeadLetterConfig: {
                TargetArn: 'arn:aws:sns:region:accountid:foo',
              },
            },
          };

          const compiledDlqStatement = {
            Effect: 'Allow',
            Action: ['sns:Publish'],
            Resource: ['arn:aws:sns:region:accountid:foo'],
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
            const compiledCfTemplate =
              awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            const dlqStatement =
              compiledCfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0]
                .PolicyDocument.Statement[0];

            expect(functionResource).to.deep.equal(compiledFunction);
            expect(dlqStatement).to.deep.equal(compiledDlqStatement);
          });
        });

        it('should create necessary resources if a Ref is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              onError: {
                Ref: 'DLQ',
              },
            },
          };

          const compiledFunction = {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['FuncLogGroup'],
            Properties: {
              Code: {
                S3Key: `${s3Folder}/${s3FileName}`,
                S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              },
              FunctionName: 'new-service-dev-func',
              Handler: 'func.function.handler',
              MemorySize: 1024,
              Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
              Runtime: 'nodejs14.x',
              Timeout: 6,
              DeadLetterConfig: {
                TargetArn: {
                  Ref: 'DLQ',
                },
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
            const compiledCfTemplate =
              awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            expect(functionResource).to.deep.equal(compiledFunction);
          });
        });

        it('should create necessary resources if a Fn::ImportValue is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              onError: {
                'Fn::ImportValue': 'DLQ',
              },
            },
          };

          const compiledFunction = {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['FuncLogGroup'],
            Properties: {
              Code: {
                S3Key: `${s3Folder}/${s3FileName}`,
                S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              },
              FunctionName: 'new-service-dev-func',
              Handler: 'func.function.handler',
              MemorySize: 1024,
              Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
              Runtime: 'nodejs14.x',
              Timeout: 6,
              DeadLetterConfig: {
                TargetArn: {
                  'Fn::ImportValue': 'DLQ',
                },
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
            const compiledCfTemplate =
              awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            expect(functionResource).to.deep.equal(compiledFunction);
          });
        });

        it('should create necessary resources if a Fn::GetAtt is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              onError: {
                'Fn::GetAtt': ['DLQ', 'Arn'],
              },
            },
          };

          const compiledFunction = {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['FuncLogGroup'],
            Properties: {
              Code: {
                S3Key: `${s3Folder}/${s3FileName}`,
                S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              },
              FunctionName: 'new-service-dev-func',
              Handler: 'func.function.handler',
              MemorySize: 1024,
              Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
              Runtime: 'nodejs14.x',
              Timeout: 6,
              DeadLetterConfig: {
                TargetArn: {
                  'Fn::GetAtt': ['DLQ', 'Arn'],
                },
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
            const compiledCfTemplate =
              awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            expect(functionResource).to.deep.equal(compiledFunction);
          });
        });
      });

      describe('when IamRoleLambdaExecution is not used', () => {
        it('should create necessary function resources if a SNS arn is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              onError: 'arn:aws:sns:region:accountid:foo',
            },
          };

          const compiledFunction = {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['FuncLogGroup'],
            Properties: {
              Code: {
                S3Key: `${s3Folder}/${s3FileName}`,
                S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              },
              FunctionName: 'new-service-dev-func',
              Handler: 'func.function.handler',
              MemorySize: 1024,
              Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
              Runtime: 'nodejs14.x',
              Timeout: 6,
              DeadLetterConfig: {
                TargetArn: 'arn:aws:sns:region:accountid:foo',
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
            const compiledCfTemplate =
              awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;

            expect(functionResource).to.deep.equal(compiledFunction);
          });
        });
      });
    });

    describe('when using tracing config', () => {
      let s3Folder;
      let s3FileName;

      beforeEach(() => {
        s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        s3FileName = awsCompileFunctions.serverless.service.package.artifact.split(path.sep).pop();
      });

      describe('when IamRoleLambdaExecution is used', () => {
        beforeEach(() => {
          // pretend that the IamRoleLambdaExecution is used
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution =
            {
              Properties: {
                Policies: [
                  {
                    PolicyDocument: {
                      Statement: [],
                    },
                  },
                ],
              },
            };
        });

        it('should create necessary resources if a tracing config is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              tracing: 'Active',
            },
          };

          const compiledFunction = {
            Type: 'AWS::Lambda::Function',
            DependsOn: ['FuncLogGroup'],
            Properties: {
              Code: {
                S3Key: `${s3Folder}/${s3FileName}`,
                S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              },
              FunctionName: 'new-service-dev-func',
              Handler: 'func.function.handler',
              MemorySize: 1024,
              Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
              Runtime: 'nodejs14.x',
              Timeout: 6,
              TracingConfig: {
                Mode: 'Active',
              },
            },
          };

          const compiledXrayStatement = {
            Effect: 'Allow',
            Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
            Resource: ['*'],
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
            const compiledCfTemplate =
              awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            const xrayStatement =
              compiledCfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0]
                .PolicyDocument.Statement[0];

            expect(functionResource).to.deep.equal(compiledFunction);
            expect(xrayStatement).to.deep.equal(compiledXrayStatement);
          });
        });
      });
    });

    it('should create a function resource with function level environment config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          environment: {
            test1: 'test1',
          },
        },
      };

      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: ['FuncLogGroup'],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs14.x',
          Timeout: 6,
          Environment: {
            Variables: {
              test1: 'test1',
            },
          },
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should accept an environment variable with CF ref and functions', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          environment: {
            counter: {
              Ref: 'TestVariable',
            },
            list: {
              'Fn::Join:': [', ', ['a', 'b', 'c']],
            },
          },
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Environment.Variables.counter
        ).to.eql({ Ref: 'TestVariable' });
      });
    });

    it('should consider function based config when creating a function resource', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          name: 'customized-func-function',
          handler: 'func.function.handler',
          memorySize: 128,
          timeout: 10,
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: ['FuncLogGroup'],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'customized-func-function',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs14.x',
          Timeout: 10,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should include description if specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          description: 'Lambda function description',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Description
        ).to.equal('Lambda function description');
      });
    });

    it('should create corresponding function output and version objects', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
        },
        anotherFunc: {
          handler: 'anotherFunc.function.handler',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .FuncLambdaFunctionQualifiedArn
        ).to.exist;
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Outputs
            .AnotherFuncLambdaFunctionQualifiedArn
        ).to.exist;
      });
    });

    it('should create a new version object if only the configuration changed', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
        },
        anotherFunc: {
          handler: 'anotherFunc.function.handler',
        },
      };

      let firstOutputs;
      return expect(awsCompileFunctions.compileFunctions())
        .to.be.fulfilled.then(() => {
          firstOutputs =
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Outputs;

          // Change configuration
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate = {
            Resources: {},
            Outputs: {},
          };

          awsCompileFunctions.serverless.service.functions.func.environment = {
            MY_ENV_VAR: 'myvalue',
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled;
        })
        .then(() => {
          expect(
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Outputs
          ).to.not.deep.equal(firstOutputs);
        });
    });

    it('should include description under version too if function is specified', () => {
      const lambdaDescription = 'Lambda function description';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          description: lambdaDescription,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        let versionDescription;
        for (const [key, value] of _.entries(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
        )) {
          if (key.startsWith('FuncLambdaVersion')) {
            versionDescription = value.Properties.Description;
            break;
          }
        }
        return expect(versionDescription).to.equal(lambdaDescription);
      });
    });

    it('should set function declared reserved concurrency limit', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          reservedConcurrency: 5,
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: ['FuncLogGroup'],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          ReservedConcurrentExecutions: 5,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs14.x',
          Timeout: 6,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should set function declared provisioned concurrency limit', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          provisionedConcurrency: 5,
          versionFunction: false,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncProvConcLambdaAlias.Properties.ProvisionedConcurrencyConfig
        ).to.deep.equal({ ProvisionedConcurrentExecutions: 5 });
      });
    });

    it('should set function declared reserved concurrency limit even if it is zero', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          reservedConcurrency: 0,
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: ['FuncLogGroup'],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          ReservedConcurrentExecutions: 0,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs14.x',
          Timeout: 6,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });
  });

  describe('#compileRole()', () => {
    it('should not set unset properties when not specified in yml (layers, vpc, etc)', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();

      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: ['FuncLogGroup'],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs14.x',
          Timeout: 6,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should set Layers when specified', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();

      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          layers: ['arn:aws:xxx:*:*'],
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: ['FuncLogGroup'],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs14.x',
          Timeout: 6,
          Layers: ['arn:aws:xxx:*:*'],
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should set Condition when specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          condition: 'IsE2eTest',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Condition
        ).to.equal('IsE2eTest');
      });
    });

    it('should include DependsOn when specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          dependsOn: ['MyThing', 'MyOtherThing'],
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup', 'MyThing', 'MyOtherThing']);
      });
    });
  });
});

describe('lib/plugins/aws/package/compile/functions/index.test.js', () => {
  describe('Provider properties', () => {
    let cfResources;
    let cfOutputs;
    let naming;
    let serviceConfig;
    let iamRolePolicyStatements;

    before(async () => {
      const imageSha = '6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38';
      const imageWithSha = `000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:${imageSha}`;
      const { awsNaming, cfTemplate, fixtureData } = await runServerless({
        fixture: 'packageArtifact',
        command: 'package',
        configExt: {
          provider: {
            kmsKeyArn: 'arn:aws:kms:region:accountid:pro/vider',
            vpc: {
              subnetIds: ['subnet-01010101'],
              securityGroupIds: ['sg-0a0a0a0a'],
            },
            tags: {
              'providerTagA': 'providerTagAValue',
              'providerTagB': 'providerTagBValue',
              'provider:tagC': 'providerTagCValue',
              'provider:tag-D': 'providerTagDValue',
            },
            tracing: {
              lambda: 'Active',
            },
            environment: {
              providerEnvVarA: 'providerEnvVarAValue',
              providerEnvVarB: 'providerEnvVarBValue',
              sharedEnvVar: 'valueFromProvider',
              providerCfIfEnvVar: { 'Fn::If': ['cond', 'first', 'second'] },
            },
            memorySize: 4096,
            runtime: 'nodejs14.x',
            deploymentBucket: 'com.serverless.deploys',
            versionFunctions: false,
          },
          functions: {
            fnImage: { image: imageWithSha },
            foo: {
              vpc: {
                subnetIds: ['subnet-02020202'],
                securityGroupIds: ['sg-1b1b1b1b'],
              },
              kmsKeyArn: 'arn:aws:kms:region:accountid:fun/ction',
              tracing: 'PassThrough',
              environment: {
                funcEnvVarA: 'funcEnvVarAValue',
                funcEnvVarB: 'funcEnvVarBValue',
                sharedEnvVar: 'valueFromFunction',
              },
              memorySize: 2048,
              runtime: 'nodejs12.x',
              versionFunction: true,
            },
            fnFileSystemConfig: {
              handler: 'index.handler',
              fileSystemConfig: {
                localMountPath: '/mnt/path',
                arn: 'arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-a1a1a1a1a1a1a1a1a',
              },
            },
            vpcNullify: {
              vpc: null,
              handler: 'index.handler',
            },
          },
        },
      });
      cfResources = cfTemplate.Resources;
      cfOutputs = cfTemplate.Outputs;
      naming = awsNaming;
      serviceConfig = fixtureData.serviceConfig;
      iamRolePolicyStatements =
        cfResources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement;
    });

    it('should support `package.artifact`', async () => {
      const {
        Code: { S3Key },
      } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      expect(S3Key.endsWith('artifact.zip')).to.be.true;
    });

    it('should prefer `functions[].package.artifact` over service.package.artifact', () => {
      const {
        Code: { S3Key },
      } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(S3Key.endsWith('artifact-function.zip')).to.be.true;
    });

    it('should support `provider.vpc`', () => {
      const providerConfig = serviceConfig.provider;

      const { VpcConfig } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(VpcConfig.SecurityGroupIds).to.deep.equal(providerConfig.vpc.securityGroupIds);
      expect(VpcConfig.SubnetIds).to.deep.equal(providerConfig.vpc.subnetIds);
    });

    it('should prefer `functions[].vpc` over `provider.vpc`', () => {
      const fooFunctionConfig = serviceConfig.functions.foo;

      const { VpcConfig } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      expect(VpcConfig.SecurityGroupIds).to.deep.equal(fooFunctionConfig.vpc.securityGroupIds);
      expect(VpcConfig.SubnetIds).to.deep.equal(fooFunctionConfig.vpc.subnetIds);
    });

    it('should allow `functions[].vpc` to specify no vpc', () => {
      const Properties = cfResources[naming.getLambdaLogicalId('vpcNullify')].Properties;

      expect(Properties.VpcConfig).to.be.undefined;
    });

    it('should support `provider.tags`', () => {
      const providerConfig = serviceConfig.provider;

      const expectedTags = Object.entries(providerConfig.tags).map(([Key, Value]) => ({
        Key,
        Value,
      }));
      const { Tags } = cfResources[naming.getLambdaLogicalId('other')].Properties;
      expect(Tags).to.deep.include.members(expectedTags);
    });

    it('should support both `provider.tags and `function[].tags`', () => {
      const providerConfig = serviceConfig.provider;
      const fooFunctionConfig = serviceConfig.functions.foo;

      const expectedTags = Object.entries({
        ...providerConfig.tags,
        ...fooFunctionConfig.tags,
      }).map(([Key, Value]) => ({ Key, Value }));

      const { Tags } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(Tags).to.deep.include.members(expectedTags);
    });

    it('should support `provider.kmsKeyArn`', () => {
      const { KmsKeyArn } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(KmsKeyArn).to.equal(serviceConfig.provider.kmsKeyArn);
      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: ['kms:Decrypt'],
        Resource: [serviceConfig.provider.kmsKeyArn],
      });
    });

    it('should prefer `functions[].kmsKeyArn` over `provider.kmsKeyArn`', () => {
      const fooFunctionConfig = serviceConfig.functions.foo;

      const { KmsKeyArn } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      expect(KmsKeyArn).to.equal(fooFunctionConfig.kmsKeyArn);
      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: ['kms:Decrypt'],
        Resource: [fooFunctionConfig.kmsKeyArn],
      });
    });

    it('should support `provider.tracing.lambda`', () => {
      const providerConfig = serviceConfig.provider;

      const { TracingConfig } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(TracingConfig).to.deep.equal({ Mode: providerConfig.tracing.lambda });
      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        Resource: ['*'],
      });
    });

    it('should prefer `functions[].tracing` over `provider.tracing.lambda`', () => {
      const fooFunctionConfig = serviceConfig.functions.foo;

      const { TracingConfig } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      expect(TracingConfig).to.deep.equal({ Mode: fooFunctionConfig.tracing });
      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        Resource: ['*'],
      });
    });

    it('should support `provider.environment`', () => {
      const providerConfig = serviceConfig.provider;

      const {
        Environment: { Variables },
      } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(Variables).to.deep.equal(providerConfig.environment);
    });

    it('should prefer `functions[].environment` over `provider.environment`', () => {
      const providerConfig = serviceConfig.provider;
      const fooFunctionConfig = serviceConfig.functions.foo;

      const {
        Environment: { Variables },
      } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      const expectedVariables = {
        ...providerConfig.environment,
        ...fooFunctionConfig.environment,
      };
      expect(Variables).to.deep.equal(expectedVariables);
    });

    it('should support `provider.memorySize`', () => {
      const providerConfig = serviceConfig.provider;

      const { MemorySize } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(MemorySize).to.equal(providerConfig.memorySize);
    });

    it('should prefer `functions[].memorySize` over `provider.memorySize`', () => {
      const fooFunctionConfig = serviceConfig.functions.foo;

      const { MemorySize } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      expect(MemorySize).to.equal(fooFunctionConfig.memorySize);
    });

    it('should support `provider.runtime`', () => {
      const providerConfig = serviceConfig.provider;

      const { Runtime } = cfResources[naming.getLambdaLogicalId('other')].Properties;

      expect(Runtime).to.equal(providerConfig.runtime);
    });

    it('should prefer `functions[].runtime` over `provider.runtime`', () => {
      const fooFunctionConfig = serviceConfig.functions.foo;

      const { Runtime } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      expect(Runtime).to.equal(fooFunctionConfig.runtime);
    });

    it('should support `provider.versionFunctions: false`', () => {
      expect(cfOutputs).to.not.have.property(naming.getLambdaVersionOutputLogicalId('other'));
    });

    it('should prefer `functions[].versionFunction` over `provider.versionFunctions`', () => {
      expect(cfOutputs).to.have.property(naming.getLambdaVersionOutputLogicalId('foo'));
    });

    it('should support `provider.deploymentBucket`', () => {
      const providerConfig = serviceConfig.provider;

      const {
        Code: { S3Bucket },
      } = cfResources[naming.getLambdaLogicalId('foo')].Properties;

      expect(S3Bucket).to.deep.equal(providerConfig.deploymentBucket);
    });

    it('should support `functions[].fileSystemConfig` with vpc configured on provider', () => {
      const functionServiceConfig = serviceConfig.functions.fnFileSystemConfig;
      const fileSystemCfConfig =
        cfResources[naming.getLambdaLogicalId('fnFileSystemConfig')].Properties;

      const { arn, localMountPath } = functionServiceConfig.fileSystemConfig;
      expect(arn).to.match(/^arn/);
      expect(localMountPath).to.be.a('string');
      expect(fileSystemCfConfig.FileSystemConfigs).to.deep.equal([
        { Arn: arn, LocalMountPath: localMountPath },
      ]);
      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
        Resource: [arn],
      });
    });

    it('should support `provider.architecture`', async () => {
      const imageSha = '6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38';
      const imageWithSha = `000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:${imageSha}`;
      const {
        awsNaming: localNaming,
        cfTemplate: { Resources: localResources },
      } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          functions: { fnImage: { image: imageWithSha } },
          provider: { architecture: 'arm64' },
        },
      });

      expect(
        localResources[localNaming.getLambdaLogicalId('basic')].Properties.Architectures
      ).to.deep.equal(['arm64']);
      expect(
        localResources[localNaming.getLambdaLogicalId('fnImage')].Properties.Architectures
      ).to.deep.equal(['arm64']);
      expect(cfResources[naming.getLambdaLogicalId('fnImage')].Properties).to.not.have.property(
        'Architectures'
      );
      expect(cfResources[naming.getLambdaLogicalId('foo')].Properties).to.not.have.property(
        'Architectures'
      );
    });

    it('should support `vpc` defined with `Fn::Split`', async () => {
      const { awsNaming, cfTemplate, fixtureData } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          provider: {
            vpc: {
              subnetIds: {
                'Fn::Split': [',', 'subnet-01010101,subnet-21212121'],
              },
              securityGroupIds: {
                'Fn::Split': [',', 'sg-0a0a0a0a,sg-0b0b0b0b'],
              },
            },
          },
        },
      });

      const providerConfig = fixtureData.serviceConfig.provider;

      const { VpcConfig } = cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')].Properties;

      expect(VpcConfig.SecurityGroupIds).to.deep.equal(providerConfig.vpc.securityGroupIds);
      expect(VpcConfig.SubnetIds).to.deep.equal(providerConfig.vpc.subnetIds);
    });

    describe('when custom IAM role is used', () => {
      let customRoleServiceConfig;
      let basicFunctionRole;
      let otherFunctionRole;

      before(async () => {
        const { awsNaming, cfTemplate, fixtureData } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              iam: {
                role: 'arn:aws:iam::123456789012:role/fromProvider',
              },
            },
            functions: {
              basic: {
                role: 'arn:aws:iam::123456789012:role/fromFunction',
              },
            },
          },
        });
        basicFunctionRole =
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')].Properties.Role;
        otherFunctionRole =
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('other')].Properties.Role;
        customRoleServiceConfig = fixtureData.serviceConfig;
      });

      it('should support `provider.iam.role` as arn string', async () => {
        const providerConfig = customRoleServiceConfig.provider;

        expect(otherFunctionRole).to.equal(providerConfig.iam.role);
      });

      it('should prefer `functions[].role` over `provider.iam.role`', () => {
        const basicFunctionConfig = customRoleServiceConfig.functions.basic;

        expect(basicFunctionRole).to.equal(basicFunctionConfig.role);
      });

      it('should support `provider.iam.role` defined as CF function', async () => {
        const { awsNaming, cfTemplate, fixtureData } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              iam: {
                role: {
                  'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/fromFunction',
                },
              },
            },
          },
        });

        const functionRole =
          cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')].Properties.Role;
        expect(functionRole).to.deep.equal(fixtureData.serviceConfig.provider.iam.role);
      });
    });
  });

  describe('`provider.role` variants', () => {
    it('should support resource name', async () => {
      const { awsNaming, cfTemplate, fixtureData } = await runServerless({
        fixture: 'function',
        configExt: {
          provider: {
            iam: {
              role: 'LogicalNameRole',
            },
          },
        },
        command: 'package',
      });

      const funcResource = cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')];
      expect(funcResource.DependsOn).to.deep.equal(['BasicLogGroup', 'LogicalNameRole']);
      expect(funcResource.Properties.Role).to.deep.equal({
        'Fn::GetAtt': [fixtureData.serviceConfig.provider.iam.role, 'Arn'],
      });
    });

    it('should support Fn::GetAtt function', async () => {
      const { awsNaming, cfTemplate, fixtureData } = await runServerless({
        fixture: 'function',
        configExt: {
          provider: {
            iam: {
              role: {
                'Fn::GetAtt': ['LogicalNameRole', 'Arn'],
              },
            },
          },
        },
        command: 'package',
      });

      const funcResource = cfTemplate.Resources[awsNaming.getLambdaLogicalId('basic')];
      expect(funcResource.DependsOn).to.deep.equal(['BasicLogGroup', 'LogicalNameRole']);
      expect(funcResource.Properties.Role).to.deep.equal(
        fixtureData.serviceConfig.provider.iam.role
      );
    });
  });

  describe('`provider.lambdaHashingVersion` support', () => {
    it('CodeSha256 for functions should be the same for default hashing and for 20200924 version', async () => {
      const { servicePath: serviceDir, updateConfig } = await fixtures.setup('function', {
        configExt: {
          provider: {
            versionFunctions: true,
          },
        },
      });

      const { cfTemplate: originalTemplate, awsNaming } = await runServerless({
        cwd: serviceDir,
        command: 'package',
      });

      const functionCfLogicalId = awsNaming.getLambdaLogicalId('basic');

      const originalVersionCfConfig = Object.values(originalTemplate.Resources).find(
        (resource) =>
          resource.Type === 'AWS::Lambda::Version' &&
          resource.Properties.FunctionName.Ref === functionCfLogicalId
      ).Properties;

      await updateConfig({
        disabledDeprecations: ['LAMBDA_HASHING_VERSION_PROPERTY'],
        provider: {
          lambdaHashingVersion: '20200924',
        },
      });
      const { cfTemplate: updatedTemplate } = await runServerless({
        cwd: serviceDir,
        command: 'package',
      });
      const updatedVersionCfConfig = Object.values(updatedTemplate.Resources).find(
        (resource) =>
          resource.Type === 'AWS::Lambda::Version' &&
          resource.Properties.FunctionName.Ref === functionCfLogicalId
      ).Properties;

      expect(originalVersionCfConfig.CodeSha256).to.deep.equal(updatedVersionCfConfig.CodeSha256);
    });
  });

  describe('Function properties', () => {
    let cfResources;
    let naming;
    let serverless;
    let serviceConfig;
    let iamRolePolicyStatements;
    const imageSha = '6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38';
    const imageWithSha = `000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:${imageSha}`;

    before(async () => {
      const {
        awsNaming,
        cfTemplate,
        serverless: serverlessInstance,
        fixtureData,
      } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          functions: {
            target: {
              handler: 'target.handler',
            },
            trigger: {
              handler: 'trigger.handler',
              destinations: { onSuccess: 'target' },
            },
            fnArch: {
              handler: 'target.handler',
              architecture: 'arm64',
            },
            fnTargetFailure: {
              handler: 'target.handler',
            },
            fnDestinationsOnFailure: {
              handler: 'trigger.handler',
              destinations: { onFailure: 'fnTargetFailure' },
            },
            fnDestinationsArn: {
              handler: 'trigger.handler',
              destinations: { onSuccess: 'arn:aws:lambda:us-east-1:12313231:function:external' },
            },
            fnDisabledLogs: { handler: 'trigger.handler', disableLogs: true },
            fnMaximumEventAge: { handler: 'trigger.handler', maximumEventAge: 3600 },
            fnMaximumRetryAttempts: { handler: 'trigger.handler', maximumRetryAttempts: 0 },
            fnFileSystemConfig: {
              handler: 'trigger.handler',
              vpc: {
                subnetIds: ['subnet-01010101'],
                securityGroupIds: ['sg-0a0a0a0a'],
              },
              fileSystemConfig: {
                localMountPath: '/mnt/path',
                arn: 'arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-a1a1a1a1a1a1a1a1a',
              },
            },
            fnImage: {
              image: imageWithSha,
            },
            fnImageArch: {
              image: imageWithSha,
              architecture: 'arm64',
            },
            fnImageWithConfig: {
              image: {
                uri: imageWithSha,
                workingDirectory: './workdir',
                entryPoint: ['executable', 'param1'],
                command: ['anotherexecutable'],
              },
            },
            fnExternalLayer: {
              handler: 'target.handler',
              layers: [{ Ref: 'ExternalLambdaLayer' }],
            },
          },
          resources: {
            Resources: {
              ExternalLambdaLayer: {
                Type: 'AWS::Lambda::LayerVersion',
                Properties: {
                  CompatibleRuntimes: ['nodejs12.x'],
                  Content: {
                    S3Bucket: 'bucket',
                    S3Key: 'key',
                  },
                  LayerName: 'externalLayer',
                },
              },
            },
          },
        },
      });
      cfResources = cfTemplate.Resources;
      naming = awsNaming;
      serverless = serverlessInstance;
      serviceConfig = fixtureData.serviceConfig;
      iamRolePolicyStatements =
        cfResources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement;
    });

    it.skip('TODO: should support `functions[].package.artifact`, referencing local file', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L170-L188
    });

    it.skip('TODO: should generate expected function resource', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L482-L516
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2288-L2323
      //
      // With basic configuration confirm on generated function resource properties:
      // Code, FunctionName, Handler, MemorySize, Role, Runtime, Timeout
      // Confirm also that all optional properties are not set on resource
    });

    it.skip('TODO: should support `functions[].role`, expressed via arn', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L283-L303
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L400-L434
    });

    it.skip('TODO: should support `functions[].role`, expressed via resource name', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L305-L327
    });

    it.skip('TODO: should support `functions[].role`, expressed via Fn::GetAtt', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L329-L351
    });

    it.skip('TODO: should support `functions[].role`, expressed via Fn::ImportValue', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L353-L375
    });

    it.skip('TODO: should support `functions[].vpc`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L563-L605
    });

    it.skip('TODO: should support `function[].tags`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L653-L696
    });

    it.skip('TODO: should support `functions[].tracing`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1457-L1504
      //
      // Confirm on TracingConfig property
      // Confirm also on needed IAM policies
    });

    it.skip('TODO: should support `functions[].onError` as arn', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L774-L821
      //
      // Confirm on Function `DeadLetterConfig` property and on IAM policy statement being added
    });

    it.skip('TODO: should support `functions[].onError` as Ref', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L823-L863
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L951-L988
      //
      // Also rely on custom IAM role (simply to confirm that logic doesn't stumble)
    });

    it.skip('TODO: should support `functions[].onError` as Fn::ImportValue', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L865-L905
    });

    it.skip('TODO: should support `functions[].onError` as Fn::GetAtt', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L907-L948
    });

    it.skip('TODO: should support `functions[].kmsKeyArn` as Fn::GetAtt', () => {});

    it.skip('TODO: should support `functions[].kmsKeyArn` as Ref', () => {});

    it.skip('TODO: should support `functions[].kmsKeyArn` as Fn::ImportValue', () => {});

    it.skip('TODO: should support `functions[].environment`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1601-L1644
    });

    it.skip('TODO: should support `functions[].environment` as CF intrinsic function', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1760-L1782
    });

    it.skip('TODO: should support `functions[].name`', () => {
      // Partial replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1784-L1820
    });
    it.skip('TODO: should support `functions[].memorySize`', () => {
      // Partial replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1784-L1820
    });
    it.skip('TODO: should support `functions[].timeout`', () => {
      // Partial replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1784-L1820
    });

    it('should default to "nodejs14.x" runtime`', () => {
      const funcResource = cfResources[naming.getLambdaLogicalId('target')];
      expect(funcResource.Properties.Runtime).to.equal('nodejs14.x');
    });

    it.skip('TODO: should support `functions[].runtime`', () => {
      // Partial replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1784-L1820
    });

    it.skip('TODO: should support `functions[].description`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1984-L1998
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2059-L2080
      //
      // Ensure it's also at version resource
    });

    it.skip('TODO: should create lambda version resource and the output', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2000-L2020
    });

    it.skip('TODO: should support `functions[].versionFunction`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2196-L2218
      //
      // Confirm that "functions[].versionFunction: true" makes function versioned if
      // `provider.versionFunctions: false`
    });

    it.skip('TODO: should support `functions[].reservedConcurrency`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2102-L2138
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2158-L2194
      //
      // Confirm also that `0` is supported
    });

    it.skip('TODO: should support `functions[].provisionedConcurrency`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2140-L2156
    });

    it.skip('TODO: should support `functions[].layers`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2325-L2362
    });

    it('should support `Ref` references to external layers (not defined as a part of `layers` top-level property in configuration)', async () => {
      expect(
        cfResources[naming.getLambdaLogicalId('fnExternalLayer')].Properties.Layers
      ).to.deep.equal([{ Ref: 'ExternalLambdaLayer' }]);
    });

    it.skip('TODO: should support `functions[].conditions`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2364-L2379
    });

    it.skip('TODO: should support `functions[].dependsOn`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2381-L2397
    });

    it('should support `functions[].architecture`', () => {
      expect(
        cfResources[naming.getLambdaLogicalId('fnArch')].Properties.Architectures
      ).to.deep.equal(['arm64']);
      expect(
        cfResources[naming.getLambdaLogicalId('fnImageArch')].Properties.Architectures
      ).to.deep.equal(['arm64']);
      expect(cfResources[naming.getLambdaLogicalId('fnImage')].Properties).to.not.have.property(
        'Architectures'
      );
      expect(cfResources[naming.getLambdaLogicalId('target')].Properties).to.not.have.property(
        'Architectures'
      );
    });

    it('should support `functions[].destinations.onSuccess` referencing function in same stack', () => {
      const destinationConfig =
        cfResources[naming.getLambdaEventConfigLogicalId('trigger')].Properties.DestinationConfig;

      expect(destinationConfig).to.deep.equal({
        OnSuccess: {
          Destination: { 'Fn::GetAtt': [naming.getLambdaLogicalId('target'), 'Arn'] },
        },
      });
      expect(destinationConfig).to.not.have.property('OnFailure');

      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: 'lambda:InvokeFunction',
        Resource: {
          'Fn::Sub': `arn:\${AWS::Partition}:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${
            serverless.service.getFunction('target').name
          }`,
        },
      });
    });

    it('should support `functions[].destinations.onFailure` referencing function in same stack', () => {
      const destinationConfig =
        cfResources[naming.getLambdaEventConfigLogicalId('fnDestinationsOnFailure')].Properties
          .DestinationConfig;

      expect(destinationConfig).to.not.have.property('OnSuccess');
      expect(destinationConfig).to.deep.equal({
        OnFailure: {
          Destination: { 'Fn::GetAtt': [naming.getLambdaLogicalId('fnTargetFailure'), 'Arn'] },
        },
      });

      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: 'lambda:InvokeFunction',
        Resource: {
          'Fn::Sub': `arn:\${AWS::Partition}:lambda:\${AWS::Region}:\${AWS::AccountId}:function:${
            serverless.service.getFunction('fnTargetFailure').name
          }`,
        },
      });
    });

    it('should support `functions[].destinations.onSuccess` referencing arn', () => {
      const destinationConfig =
        cfResources[naming.getLambdaEventConfigLogicalId('fnDestinationsArn')].Properties
          .DestinationConfig;

      const arn = serviceConfig.functions.fnDestinationsArn.destinations.onSuccess;
      expect(arn).to.match(/^arn/);
      expect(destinationConfig).to.deep.equal({
        OnSuccess: { Destination: arn },
      });

      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: 'lambda:InvokeFunction',
        Resource: arn,
      });
    });

    it('should support `functions[].disableLogs`', () => {
      expect(cfResources[naming.getLambdaLogicalId('fnDisabledLogs')]).to.not.have.property(
        'DependsOn'
      );
    });

    it('should support `functions[].maximumEventAge`', () => {
      const maximumEventAge = serviceConfig.functions.fnMaximumEventAge.maximumEventAge;
      expect(maximumEventAge).to.be.a('number');
      expect(
        cfResources[naming.getLambdaEventConfigLogicalId('fnMaximumEventAge')].Properties
          .MaximumEventAgeInSeconds
      ).to.equal(maximumEventAge);
    });

    it('should support `functions[].maximumRetryAttempts`', () => {
      const maximumRetryAttempts =
        serviceConfig.functions.fnMaximumRetryAttempts.maximumRetryAttempts;
      expect(maximumRetryAttempts).to.be.a('number');

      expect(
        cfResources[naming.getLambdaEventConfigLogicalId('fnMaximumRetryAttempts')].Properties
          .MaximumRetryAttempts
      ).to.equal(maximumRetryAttempts);
    });

    it('should support `functions[].fileSystemConfig` (with vpc configured on function)', () => {
      const functionServiceConfig = serviceConfig.functions.fnFileSystemConfig;
      const fileSystemCfConfig =
        cfResources[naming.getLambdaLogicalId('fnFileSystemConfig')].Properties;

      const { arn, localMountPath } = functionServiceConfig.fileSystemConfig;
      expect(arn).to.match(/^arn/);
      expect(localMountPath).to.be.a('string');
      expect(fileSystemCfConfig.FileSystemConfigs).to.deep.equal([
        { Arn: arn, LocalMountPath: localMountPath },
      ]);
      expect(iamRolePolicyStatements).to.deep.include({
        Effect: 'Allow',
        Action: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
        Resource: [arn],
      });
    });

    // This is just a happy-path test of images support. Due to sharing code from `provider.js`
    // all further configurations are tested as a part of `test/unit/lib/plugins/aws/provider.test.js`
    it('should support `functions[].image` with sha', () => {
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
      const versionCfConfig = Object.values(cfResources).find(
        (resource) =>
          resource.Type === 'AWS::Lambda::Version' &&
          resource.Properties.FunctionName.Ref === functionCfLogicalId
      ).Properties;
      expect(versionCfConfig.CodeSha256).to.equal(imageDigestSha);
    });

    it('should support `functions[].image` with image config properties', () => {
      const functionCfLogicalId = naming.getLambdaLogicalId('fnImageWithConfig');
      const functionCfConfig = cfResources[functionCfLogicalId].Properties;

      expect(functionCfConfig.ImageConfig).to.deep.equal({
        Command: ['anotherexecutable'],
        EntryPoint: ['executable', 'param1'],
        WorkingDirectory: './workdir',
      });
    });
  });

  describe('Validation', () => {
    it('should throw error when `functions[].fileSystemConfig` is configured with no vpc', () => {
      return runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            basic: {
              fileSystemConfig: {
                localMountPath: '/mnt/path',
                arn: 'arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-a1a1a1a1a1a1a1a1a',
              },
            },
          },
        },
        command: 'package',
      }).catch((error) => {
        expect(error).to.have.property('code', 'LAMBDA_FILE_SYSTEM_CONFIG_MISSING_VPC');
      });
    });
  });

  describe('Version hash resolution', () => {
    const testLambdaHashingVersion = (lambdaHashingVersion) => {
      const configExt = lambdaHashingVersion
        ? {
            provider: { lambdaHashingVersion },
            disabledDeprecations: ['LAMBDA_HASHING_VERSION_PROPERTY'],
          }
        : {};

      it.skip('TODO: should create a different version if configuration changed', () => {
        // Replacement for
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2022-L2057
        //
        // Configure in similar fashion as test below
      });

      it('should not create a different version if only function-wide configuration changed', async () => {
        const { servicePath: serviceDir, updateConfig } = await fixtures.setup('function', {
          configExt,
        });

        const { cfTemplate: originalTemplate } = await runServerless({
          cwd: serviceDir,
          command: 'package',
        });
        const originalVersionArn =
          originalTemplate.Outputs.BasicLambdaFunctionQualifiedArn.Value.Ref;

        await updateConfig({
          functions: {
            basic: {
              tags: {
                basic: 'bar',
              },
              reservedConcurrency: 1,
            },
          },
        });
        const { cfTemplate: updatedTemplate } = await runServerless({
          cwd: serviceDir,
          command: 'package',
        });
        const updatedVersionArn = updatedTemplate.Outputs.BasicLambdaFunctionQualifiedArn.Value.Ref;

        expect(
          updatedTemplate.Resources.BasicLambdaFunction.Properties.ReservedConcurrentExecutions
        ).to.equal(1);

        expect(originalVersionArn).to.equal(updatedVersionArn);
      });

      describe('with layers', () => {
        let firstCfTemplate;
        let serviceDir;
        let updateConfig;
        const mockDescribeStackResponse = {
          CloudFormation: {
            describeStacks: { Stacks: [{ Outputs: [{ OutputKey: 'test' }] }] },
          },
        };

        beforeEach(async () => {
          const serviceData = await fixtures.setup('functionLayers', { configExt });
          ({ servicePath: serviceDir, updateConfig } = serviceData);
          const data = await runServerless({
            cwd: serviceDir,
            command: 'package',
            awsRequestStubMap: mockDescribeStackResponse,
          });
          firstCfTemplate = data.cfTemplate;
        });

        it('should create different version ids for identical lambdas with and without layers', () => {
          expect(
            firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
          ).to.not.equal(firstCfTemplate.Outputs.NoLayerFuncLambdaFunctionQualifiedArn.Value.Ref);
        });

        it('should generate different lambda version id when lambda layer properties are different', async () => {
          const firstVersionId =
            firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

          await updateConfig({
            layers: { testLayer: { path: 'testLayer', description: 'Different description' } },
          });

          const data = await runServerless({
            cwd: serviceDir,
            command: 'package',
            awsRequestStubMap: mockDescribeStackResponse,
          });

          expect(firstVersionId).to.not.equal(
            data.cfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
          );
        });

        it('should ignore changing character of S3Key paths when generating layer version id', async () => {
          // the S3Key path is timestamped and so changes on every deployment regardless of layer changes, and should
          // therefore not be included in the version id digest
          const firstVersionId =
            firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;
          const firstS3Key =
            firstCfTemplate.Resources.TestLayerLambdaLayer.Properties.Content.S3Key;

          const data = await runServerless({
            cwd: serviceDir,
            command: 'package',
            awsRequestStubMap: mockDescribeStackResponse,
          });

          expect(firstS3Key).to.not.equal(
            data.cfTemplate.Resources.TestLayerLambdaLayer.Properties.Content.S3Key
          );
          expect(firstVersionId).to.equal(
            data.cfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
          );
        });

        it('should ignore properties order when generating layer version id', async () => {
          const firstVersionId =
            firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

          await updateConfig({
            functions: {
              layerFunc: { layers: [{ Ref: 'TestLayerLambdaLayer' }], handler: 'index.handler' },
            },
          });

          const data = await runServerless({
            cwd: serviceDir,
            command: 'package',
            awsRequestStubMap: mockDescribeStackResponse,
          });

          expect(firstVersionId).to.equal(
            data.cfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
          );
        });

        it('should create different lambda version id for different property keys (but no different values)', async () => {
          const firstVersionId =
            firstCfTemplate.Outputs.LayerFuncWithConfigLambdaFunctionQualifiedArn.Value.Ref;

          await updateConfig({
            functions: {
              layerFuncWithConfig: { handler: 'index.handler', timeout: 128 },
            },
          });

          const data = await runServerless({
            cwd: serviceDir,
            command: 'package',
            awsRequestStubMap: mockDescribeStackResponse,
          });

          expect(firstVersionId).to.not.equal(
            data.cfTemplate.Outputs.LayerFuncWithConfigLambdaFunctionQualifiedArn.Value.Ref
          );
        });

        it('should create same version id when layer source and config are unchanged', async () => {
          const firstVersionId =
            firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

          const data = await runServerless({
            cwd: serviceDir,
            command: 'package',
            awsRequestStubMap: mockDescribeStackResponse,
          });

          expect(firstVersionId).to.equal(
            data.cfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
          );
        });

        it('should generate different lambda version id when lambda layer arns are different', async () => {
          const firstVersionId =
            firstCfTemplate.Outputs.ArnLayerFuncLambdaFunctionQualifiedArn.Value.Ref;

          await updateConfig({
            functions: {
              arnLayerFunc: {
                handler: 'index.handler',
                layers: ['arn:aws:lambda:us-east-2:123456789012:layer:my-layer:2'],
              },
            },
          });

          const data = await runServerless({
            cwd: serviceDir,
            command: 'package',
            awsRequestStubMap: mockDescribeStackResponse,
          });

          expect(firstVersionId).to.not.equal(
            data.cfTemplate.Outputs.ArnLayerFuncLambdaFunctionQualifiedArn.Value.Ref
          );
        });

        describe('when layer content is changed', () => {
          let originalLayer;
          let sourceChangeLayer;
          let backupLayer;

          beforeEach(async () => {
            originalLayer = path.join(serviceDir, 'testLayer');
            sourceChangeLayer = path.join(serviceDir, 'extra_layers', 'testLayerSourceChange');
            backupLayer = path.join(serviceDir, 'extra_layers', 'testLayerBackup');

            await fsp.rename(originalLayer, backupLayer);
            await fsp.rename(sourceChangeLayer, originalLayer);
            getHashForFilePath.clear();
          });

          afterEach(async () => {
            await fsp.rename(originalLayer, sourceChangeLayer);
            await fsp.rename(backupLayer, originalLayer);
          });

          it('should create different lambda version id', async () => {
            const firstVersionId =
              firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

            const data = await runServerless({
              cwd: serviceDir,
              command: 'package',
              awsRequestStubMap: mockDescribeStackResponse,
            });

            expect(firstVersionId).to.not.equal(
              data.cfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
            );
          });
        });
      });
    };
    describe('default hashing version', () => {
      testLambdaHashingVersion();
    });

    describe('lambdaHashingVersion: 20200924', () => {
      testLambdaHashingVersion('20200924');
    });

    describe('lambdaHashingVersion migration', () => {
      it('should enforce new description configuration and version with `--enforce-hash-update` flag', async () => {
        const { servicePath: serviceDir } = await fixtures.setup('function', {
          configExt: {
            disabledDeprecations: ['LAMBDA_HASHING_VERSION_V2'],
            provider: {
              lambdaHashingVersion: null,
            },
          },
        });

        const { cfTemplate: originalTemplate, awsNaming } = await runServerless({
          cwd: serviceDir,
          command: 'package',
        });
        const originalVersionArn =
          originalTemplate.Outputs.BasicLambdaFunctionQualifiedArn.Value.Ref;

        const { cfTemplate: updatedTemplate } = await runServerless({
          cwd: serviceDir,
          command: 'deploy',
          lastLifecycleHookName: 'before:deploy:deploy',
          options: {
            'enforce-hash-update': true,
          },
        });
        const updatedVersionArn = updatedTemplate.Outputs.BasicLambdaFunctionQualifiedArn.Value.Ref;

        expect(originalVersionArn).not.to.equal(updatedVersionArn);
        expect(
          updatedTemplate.Resources[awsNaming.getLambdaLogicalId('basic')].Properties.Description
        ).to.equal('temporary-description-to-enforce-hash-update');
      });
    });
  });

  describe.skip('TODO: Download package artifact from S3 bucket', () => {
    before(async () => {
      await runServerless({
        fixture: 'packageArtifact',
        command: 'deploy',
        configExt: {
          package: { artifact: 'some s3 url' },
          functions: { basic: { package: { individually: true, artifact: 'other s3 url' } } },
        },
      });
    });

    it('should support `package.artifact`', () => {
      // Replacement for:
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L118-L131
      //
      // Through `awsRequestStubMap` mock:
      // 1. S3.getObject to return some string stream here:
      //    https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.js#L95-L98
      // 2. S3.upload with a spy here:
      //    https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/deploy/lib/uploadArtifacts.js#L78
      //    On which we would confirm that
      //    - It's generated string that's being send
      //    - Corresponding url is configured in CF template
      // Test with "deploy" command, and configure `lastLifecycleHookName` to 'aws:deploy:deploy:uploadArtifact'
      // It'll demand stubbing few other AWS calls for that follow this stub:
      // https://github.com/serverless/dashboard-plugin/blob/cdd53df45dfad18d8bdd79969194a61cb8178671/lib/deployment/parse.test.js#L1585-L1627
      // Confirm same artifact is used for all functions
    });

    it('should support `functions[].package.artifact', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L100-L116
      //
      // Same as above just confirm on individual function (and confirm it's the only function that gets that)
    });
  });
});
