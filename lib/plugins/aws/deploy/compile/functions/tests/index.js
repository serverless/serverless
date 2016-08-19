'use strict';

const path = require('path');
const expect = require('chai').expect;
const AwsCompileFunctions = require('../index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileFunctions', () => {
  let serverless;
  let awsCompileFunctions;

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
  });

  describe('#constructor()', () => {
    it('should set the provider variable to "aws"', () => expect(awsCompileFunctions.provider)
      .to.equal('aws'));
  });

  describe('#compileFunctions()', () => {
    it('should merge the IamRoleLambda template into the CloudFormation template', () => {
      const iamRoleLambdaTemplate = awsCompileFunctions.serverless.utils.readFileSync(
        path.join(
          __dirname,
          '..',
          'iam-role-lambda-template.json'
        )
      );

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamRoleLambda
      ).to.deep.equal(iamRoleLambdaTemplate.IamRoleLambda);
    });

    it('should merge the IamPolicyLambda template into the CloudFormation template', () => {
      awsCompileFunctions.compileFunctions();

      // we check for the type here because a deep equality check will error out due to
      // the updates which are made after the merge (they are tested in a separate test)
      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamPolicyLambda.Type
      ).to.deep.equal('AWS::IAM::Policy');
    });

    it('should update the necessary variables for the IamPolicyLambda', () => {
      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyName
      ).to.equal(
        `${
          awsCompileFunctions.options.stage
        }-${
          awsCompileFunctions.serverless.service.service
        }-lambda`
      );

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.equal(`arn:aws:logs:${awsCompileFunctions.options.region}:*:*`);
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
        .Resources.IamPolicyLambda.Properties.PolicyDocument.Statement[1]
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.iamRoleStatements[0]);
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
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.func
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
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
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
          .Resources.func
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
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
          },
          FunctionName: 'customized-func-function',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 10,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.func
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
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.func
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
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] },
          Runtime: 'python2.7',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.func
      ).to.deep.equal(compiledFunction);
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
        Function1Arn: {
          Description: 'Lambda function info',
          Value: { 'Fn::GetAtt': ['func', 'Arn'] },
        },
        Function2Arn: {
          Description: 'Lambda function info',
          Value: { 'Fn::GetAtt': ['anotherFunc', 'Arn'] },
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
        Function1Arn: {
          Description: 'Lambda function info',
          Value: { 'Fn::GetAtt': ['func', 'Arn'] },
        },
        Function2Arn: {
          Description: 'Lambda function info',
          Value: { 'Fn::GetAtt': ['anotherFunc', 'Arn'] },
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
