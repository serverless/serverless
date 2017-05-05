'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsProvider = require('../../../provider/awsProvider');
const AwsCompileFunctions = require('./index');
const testUtils = require('../../../../../../tests/utils');
const Serverless = require('../../../../../Serverless');

describe('AwsCompileFunctions', () => {
  let serverless;
  let awsCompileFunctions;
  const functionName = 'test';
  const compiledFunctionName = 'TestLambdaFunction';

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileFunctions = new AwsCompileFunctions(serverless, options);
    awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };

    const serviceArtifact = 'new-service.zip';
    const individualArtifact = 'test.zip';
    awsCompileFunctions.packagePath = testUtils.getTmpDirPath();
    // The contents of the test artifacts need to be predictable so the hashes stay the same
    serverless.utils.writeFileSync(path.join(awsCompileFunctions.packagePath,
      serviceArtifact), 'foobar');
    serverless.utils.writeFileSync(path.join(awsCompileFunctions.packagePath,
      individualArtifact), 'barbaz');

    awsCompileFunctions.serverless.service.service = 'new-service';
    awsCompileFunctions.serverless.service.package.artifactDirectoryName = 'somedir';
    awsCompileFunctions.serverless.service.package
      .artifact = path.join(awsCompileFunctions.packagePath, serviceArtifact);
    awsCompileFunctions.serverless.service.functions = {};
    awsCompileFunctions.serverless.service.functions[functionName] = {
      name: 'test',
      package: {
        artifact: path.join(awsCompileFunctions.packagePath,
          individualArtifact),
      },
      handler: 'handler.hello',
    };
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileFunctions.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileFunctions()', () => {
    it('should use service artifact if not individually', () => {
      awsCompileFunctions.serverless.service.package.individually = false;
      const artifactTemp = awsCompileFunctions.serverless.service.functions.test.package.artifact;
      awsCompileFunctions.serverless.service.functions.test.package.artifact = false;
      awsCompileFunctions.compileFunctions();

      const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[compiledFunctionName];

      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
                          .split(path.sep).pop();

      expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
      awsCompileFunctions.serverless.service.functions.test.package.artifact = artifactTemp;
    });

    it('should use function artifact if individually', () => {
      awsCompileFunctions.serverless.service.package.individually = true;
      awsCompileFunctions.compileFunctions();

      const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[compiledFunctionName];

      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service
        .functions[functionName].package.artifact.split(path.sep).pop();

      expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
    });

    it('should use function artifact if individually at function level', () => {
      awsCompileFunctions.serverless.service.functions[functionName].package.individually = true;
      awsCompileFunctions.compileFunctions();

      const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[compiledFunctionName];

      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service
        .functions[functionName].package.artifact.split(path.sep).pop();

      expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
      awsCompileFunctions.serverless.service.functions[functionName].package = {
        individually: false,
      };
    });

    it('should add an ARN provider role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = 'arn:aws:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);
    });

    it('should add a logical role name provider role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = 'LogicalNameRole';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn
      ).to.deep.equal(['FuncLogGroup', 'LogicalNameRole']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal({
        'Fn::GetAtt': [
          awsCompileFunctions.serverless.service.provider.role,
          'Arn',
        ],
      });
    });

    it('should add a "Fn::GetAtt" Object provider role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = {
        'Fn::GetAtt': [
          'LogicalRoleName',
          'Arn',
        ],
      };
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn
      ).to.deep.equal(['FuncLogGroup', 'LogicalRoleName']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);
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

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func.role);
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

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn
      ).to.deep.equal(['FuncLogGroup', 'LogicalRoleName']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal({
        'Fn::GetAtt': [
          awsCompileFunctions.serverless.service.functions.func.role,
          'Arn',
        ],
      });
    });

    it('should add a "Fn::GetAtt" Object function role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: {
            'Fn::GetAtt': [
              'LogicalRoleName',
              'Arn',
            ],
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn
      ).to.deep.equal(['FuncLogGroup', 'LogicalRoleName']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func.role);
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

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func.role);
    });

    it('should prefer function declared role over provider declared role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = 'arn:aws:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: 'arn:aws:xxx:*:*',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.equal(awsCompileFunctions.serverless.service.functions.func.role);
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

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func0LambdaFunction.DependsOn).to.deep.equal(['Func0LogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func0LambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func0.role);

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func1LambdaFunction.DependsOn).to.deep.equal(['Func1LogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func1LambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func1.role);
    });

    it('should add function declared role and fill in with provider role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = 'arn:aws:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func0',
        },
        func1: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func1',
          role: 'arn:aws:xx1:*:*',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func0LambdaFunction.DependsOn).to.deep.equal(['Func0LogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func0LambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func1LambdaFunction.DependsOn).to.deep.equal(['Func1LogGroup']);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func1LambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func1.role);
    });

    it('should throw an error if the function handler is not present', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          name: 'new-service-dev-func',
        },
      };

      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should create a simple function resource', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should create a function resource with provider level vpc config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.provider.vpc = {
        securityGroupIds: ['xxx'],
        subnetIds: ['xxx'],
      };

      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          VpcConfig: {
            SecurityGroupIds: ['xxx'],
            SubnetIds: ['xxx'],
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should create a function resource with function level vpc config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          vpc: {
            securityGroupIds: ['xxx'],
            subnetIds: ['xxx'],
          },
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          VpcConfig: {
            SecurityGroupIds: ['xxx'],
            SubnetIds: ['xxx'],
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should create a function resource with tags', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          tags: {
            foo: 'bar',
            baz: 'qux',
          },
        },
      };

      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'baz', Value: 'qux' },
          ],
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should create a function resource with environment config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          environment: {
            test1: 'test1',
            test2: 'test2',
          },
        },
      };

      awsCompileFunctions.serverless.service.provider.environment = {
        providerTest1: 'providerTest1',
      };

      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          Environment: {
            Variables: {
              test1: 'test1',
              test2: 'test2',
              providerTest1: 'providerTest1',
            },
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should create a function resource with function level environment config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
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
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          Environment: {
            Variables: {
              test1: 'test1',
            },
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should create a function resource with provider level environment config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };

      awsCompileFunctions.serverless.service.provider.environment = {
        providerTest1: 'providerTest1',
      };

      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          Environment: {
            Variables: {
              providerTest1: 'providerTest1',
            },
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should overwrite a provider level environment config when function config is given', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.provider.environment = {
        variable: 'overwrite-me',
      };

      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          environment: {
            variable: 'overwritten',
          },
        },
      };

      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          Environment: {
            Variables: {
              variable: 'overwritten',
            },
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should throw an error if environment variable has invalid name', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          environment: {
            '1test1': 'test1',
            test2: 'test2',
          },
        },
      };

      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should consider function based config when creating a function resource', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
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
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'customized-func-function',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 10,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should allow functions to use a different runtime' +
      ' than the service default runtime if specified', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          runtime: 'python2.7',
        },
      };

      awsCompileFunctions.compileFunctions();

      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'python2.7',
          Timeout: 6,
        },
      };

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should default to the nodejs4.3 runtime when no provider runtime is given', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.provider.runtime = null;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should consider the providers runtime and memorySize ' +
      'when creating a function resource', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.provider.runtime = 'python2.7';
      awsCompileFunctions.serverless.service.provider.memorySize = 128;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'python2.7',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should use a custom bucket if specified', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      const bucketName = 'com.serverless.deploys';

      awsCompileFunctions.serverless.service.package.deploymentBucket = bucketName;
      awsCompileFunctions.serverless.service.provider.runtime = 'python2.7';
      awsCompileFunctions.serverless.service.provider.memorySize = 128;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        DependsOn: [
          'FuncLogGroup',
          'IamRoleLambdaExecution',
        ],
        Properties: {
          Code: {
            S3Key: `${s3Folder}/${s3FileName}`,
            S3Bucket: bucketName,
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'python2.7',
          Timeout: 6,
        },
      };
      const coreCloudFormationTemplate = awsCompileFunctions.serverless.utils.readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          'lib',
          'core-cloudformation-template.json'
        )
      );
      awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate = coreCloudFormationTemplate;

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compiledFunction);
    });

    it('should include description if specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          description: 'Lambda function description',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Description
      ).to.equal('Lambda function description');
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

      const expectedOutputs = {
        FuncLambdaFunctionQualifiedArn: {
          Description: 'Current Lambda function version',
          Value: { Ref: 'FuncLambdaVersionw6uP8Tcg6K2QR905Rms8iXTlksL6OD1KOWBxTK7wxPI' },
        },
        AnotherFuncLambdaFunctionQualifiedArn: {
          Description: 'Current Lambda function version',
          Value: {
            Ref: 'AnotherFuncLambdaVersionw6uP8Tcg6K2QR905Rms8iXTlksL6OD1KOWBxTK7wxPI',
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs
      ).to.deep.equal(
        expectedOutputs
      );
    });

    it('should include description under version too if function is specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          description: 'Lambda function description',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaVersionw6uP8Tcg6K2QR905Rms8iXTlksL6OD1KOWBxTK7wxPI
        .Properties.Description
      ).to.equal('Lambda function description');
    });

    it('should not create function output objects when "versionFunctions" is false', () => {
      awsCompileFunctions.serverless.service.provider.versionFunctions = false;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
        },
        anotherFunc: {
          handler: 'anotherFunc.function.handler',
        },
      };

      const expectedOutputs = {};

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs
      ).to.deep.equal(
        expectedOutputs
      );
    });
  });

  describe('#compileRole()', () => {
    it('adds the default role with DependsOn values', () => {
      const role = 'IamRoleLambdaExecution';
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        DependsOn: [
          role,
        ],
        Properties: {
          Role: {
            'Fn::GetAtt': [
              role,
              'Arn',
            ],
          },
        },
      });
    });

    it('adds a role based on a logical name with DependsOn values', () => {
      const role = 'LogicalRoleName';
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        DependsOn: [
          role,
        ],
        Properties: {
          Role: {
            'Fn::GetAtt': [
              role,
              'Arn',
            ],
          },
        },
      });
    });

    it('adds a role based on a Fn::GetAtt with DependsOn values', () => {
      const role = { 'Fn::GetAtt': ['Foo', 'Arn'] };
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        DependsOn: [
          'Foo',
        ],
        Properties: {
          Role: role,
        },
      });
    });

    it('adds a role based on a Fn::ImportValue', () => {
      const role = { 'Fn::ImportValue': 'Foo' };
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        Properties: {
          Role: role,
        },
      });
    });

    it('adds a role based on a predefined arn string', () => {
      const role = 'arn:aws:xxx:*:*';
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        Properties: {
          Role: role,
        },
      });
    });

    describe('Errors if unsupported object type is provided', () => {
      it('should throw for object type { Ref: "Foo" }', () => {
        const role = { Ref: 'Foo' };
        const resource = { Properties: {} };

        expect(() =>
          awsCompileFunctions.compileRole(resource, role)
        ).to.throw(Error);
      });

      it('should throw for object type Buffer', () => {
        const role = new Buffer('Foo');
        const resource = { Properties: {} };

        expect(() =>
          awsCompileFunctions.compileRole(resource, role)
        ).to.throw(Error);
      });

      it('should throw for object type Array', () => {
        const role = [1, 2, 3];
        const resource = { Properties: {} };

        expect(() =>
          awsCompileFunctions.compileRole(resource, role)
        ).to.throw(Error);
      });
    });
  });
});
