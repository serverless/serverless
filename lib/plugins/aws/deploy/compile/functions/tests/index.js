'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsCompileFunctions = require('../index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileFunctions', () => {
  let serverless;
  let awsCompileFunctions;
  const functionName = 'test';
  const compiledFunctionName = 'TestLambdaFunction';

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
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
    it('should set the provider variable to "aws"', () => expect(awsCompileFunctions.provider)
      .to.equal('aws'));
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

    it('should merge the IamRoleLambdaExecution template into the CloudFormation template', () => {
      const IamRoleLambdaExecutionTemplate = awsCompileFunctions.serverless.utils.readFileSync(
        path.join(
          __dirname,
          '..',
          'iam-role-lambda-execution-template.json'
        )
      );

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamRoleLambdaExecution
      ).to.deep.equal(IamRoleLambdaExecutionTemplate.IamRoleLambdaExecution);
    });

    it('should merge IamPolicyLambdaExecution template into the CloudFormation template', () => {
      awsCompileFunctions.compileFunctions();

      // we check for the type here because a deep equality check will error out due to
      // the updates which are made after the merge (they are tested in a separate test)
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamPolicyLambdaExecution.Type
      ).to.deep.equal('AWS::IAM::Policy');
    });

    it('should update IamPolicyLambdaExecution PolicyName to join $stage-$service-lambda', () => {
      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambdaExecution
        .Properties
        .PolicyName
      ).to.equal(`${
          awsCompileFunctions.options.stage
        }-${
          awsCompileFunctions.serverless.service.service
        }-lambda`);
    });

    it('should add a CloudWatch LogGroup resource', () => {
      const normalizedName = `${functionName[0].toUpperCase()}${functionName.substr(1)}LogGroup`;
      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[normalizedName]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: `/aws/lambda/${functionName}`,
          },
        }
      );
    });

    it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
      const service = awsCompileFunctions.serverless.service; // avoid 100 char lines below
      service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'func0',
        },
        func1: {
          handler: 'func.function.handler',
          name: 'func1',
        },
      };
      const f = service.functions; // avoid 100 char lines below
      const normalizedNames = [
        `${f.func0.name[0].toUpperCase()}${f.func0.name.substr(1)}LogGroup`,
        `${f.func1.name[0].toUpperCase()}${f.func1.name.substr(1)}LogGroup`,
      ];
      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[normalizedNames[0]]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: `/aws/lambda/${service.functions.func0.name}`,
          },
        }
      );
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[normalizedNames[1]]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: `/aws/lambda/${service.functions.func1.name}`,
          },
        }
      );
    });

    it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
      const normalizedName = `${functionName[0].toUpperCase()}${functionName.substr(1)}LogGroup`;
      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement[0]
          .Resource
      ).to.deep.equal(
        [
          { 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedName, 'Arn'] }, '*', '*']] },
        ]
      );
    });

    it('should update IamPolicyLambdaExecution with each function\'s logging resources', () => {
      const service = awsCompileFunctions.serverless.service; // avoid 100 char lines below
      service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'func0',
        },
        func1: {
          handler: 'func.function.handler',
          name: 'func1',
        },
      };
      const f = service.functions; // avoid 100 char lines below
      const normalizedNames = [
        `${f.func0.name[0].toUpperCase()}${f.func0.name.substr(1)}LogGroup`,
        `${f.func1.name[0].toUpperCase()}${f.func1.name.substr(1)}LogGroup`,
      ];
      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambdaExecution
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal(
        [
          { 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedNames[0], 'Arn'] }, '*', '*']] },
          { 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedNames[1], 'Arn'] }, '*', '*']] },
        ]
      );
    });

    it('should add custom IAM policy statements', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.iamRoleStatements = [
        {
          Effect: 'Allow',
          Action: [
            'something:SomethingElse',
          ],
          Resource: 'some:aws:arn:xxx:*:*',
        },
      ];

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamPolicyLambdaExecution.Properties.PolicyDocument.Statement[1]
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.iamRoleStatements[0]);
    });

    it('should add iamRoleARN', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.iamRoleARN = 'some:aws:arn:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.FuncLambdaFunction.Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.iamRoleARN);
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
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction
      ).to.deep.equal(compliedFunction);
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
});
