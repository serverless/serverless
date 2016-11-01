'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileFunctions = require('../index');
const Serverless = require('../../../../../../Serverless');

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
    awsCompileFunctions.serverless.service.service = 'new-service';
    awsCompileFunctions.serverless.service.package.artifactDirectoryName = 'somedir';
    awsCompileFunctions.serverless.service.package.artifact = 'artifact.zip';
    awsCompileFunctions.serverless.service.functions = {};
    awsCompileFunctions.serverless.service.functions[functionName] = {
      name: 'test',
      artifact: 'test.zip',
      handler: 'handler.hello',
    };
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileFunctions.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileFunctions()', () => {
    it('should throw if no service artifact', () => {
      awsCompileFunctions.serverless.service.package.artifact = null;
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should throw if no individual artifact', () => {
      awsCompileFunctions.serverless.service.package.individually = true;
      awsCompileFunctions.serverless.service.functions[functionName].artifact = null;
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should use service artifact if not individually', () => {
      awsCompileFunctions.serverless.service.package.individually = false;
      awsCompileFunctions.compileFunctions();

      const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[compiledFunctionName];

      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
                          .split(path.sep).pop();

      expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
    });

    it('should use function artifact if individually', () => {
      awsCompileFunctions.serverless.service.package.individually = true;
      awsCompileFunctions.compileFunctions();

      const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[compiledFunctionName];

      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.functions[functionName].artifact
                          .split(path.sep).pop();

      expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
    });

    it('should add an ARN provider role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };

      awsCompileFunctions.compileFunctions();

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
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);
    });

    it('should add an ARN function role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: 'some:aws:arn:xxx:*:*',
        },
      };

      awsCompileFunctions.compileFunctions();

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
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func.role);
    });

    it('should prefer function declared role over provider declared role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = 'some:provider:arn:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          role: 'some:function:arn:xxx:*:*',
        },
      };

      awsCompileFunctions.compileFunctions();

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
          role: 'some:aws:arn:xx0:*:*',
        },
        func1: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func1',
          role: 'some:aws:arn:xx1:*:*',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func0LambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func0.role);
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func1LambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.functions.func1.role);
    });

    it('should add function declared role and fill in with provider role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func0',
        },
        func1: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func1',
          role: 'some:aws:arn:xx1:*:*',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.Func0LambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);
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
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
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

    it('should create a function resource with VPC config', () => {
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
      const compliedFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
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
      ).to.deep.equal(compliedFunction);

      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
        },
      };
    });

    it('should consider function based config when creating a function resource', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          name: 'customized-func-function',
          handler: 'func.function.handler',
          memorySize: 128,
          timeout: 10,
        },
      };
      const compliedFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
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
      ).to.deep.equal(compliedFunction);
    });

    it('should allow functions to use a different runtime' +
      ' than the service default runtime if specified', () => {
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
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
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
      awsCompileFunctions.serverless.service.provider.runtime = null;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
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
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
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
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
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

    it('should create corresponding function output objects', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
        },
        anotherFunc: {
          handler: 'anotherFunc.function.handler',
        },
      };

      const expectedOutputs = {
        FuncLambdaFunctionArn: {
          Description: 'Lambda function info',
          Value: { 'Fn::GetAtt': ['FuncLambdaFunction', 'Arn'] },
        },
        AnotherFuncLambdaFunctionArn: {
          Description: 'Lambda function info',
          Value: { 'Fn::GetAtt': ['AnotherFuncLambdaFunction', 'Arn'] },
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
  });

  describe('#compileRole()', () => {
    const logicalRoleName = 'LogicalRoleName';
    const roleObject = {
      'Fn::GetAtt': [logicalRoleName, 'Arn'],
    };
    const roleArn = 'some:aws:arn:xxx:*:*';

    it('compiles a logical role name into an reference object', () => {
      expect(awsCompileFunctions.compileRole(logicalRoleName)).to.deep.equal(roleObject);
    });

    it('returns a ARN string when given', () => {
      expect(awsCompileFunctions.compileRole(roleArn)).to.be(roleArn);
    });

    it('returns a reference object when given', () => {
      expect(awsCompileFunctions.compileRole(roleObject)).to.be(roleObject);
    });
  });
});
