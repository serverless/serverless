'use strict';

const AWS = require('aws-sdk');
const fse = require('fs-extra');
const _ = require('lodash');
const path = require('path');
const chai = require('chai');
const sinon = require('sinon');
const AwsProvider = require('../../../provider/awsProvider');
const AwsCompileFunctions = require('./index');
const Serverless = require('../../../../../Serverless');
const runServerless = require('../../../../../../test/utils/run-serverless');
const fixtures = require('../../../../../../test/fixtures');

const { getTmpDirPath, createTmpFile } = require('../../../../../../test/utils/fs');

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

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileFunctions.provider).to.be.instanceof(AwsProvider));
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
    it('should use service artifact if not individually', () => {
      awsCompileFunctions.serverless.service.package.individually = false;
      const artifactTemp = awsCompileFunctions.serverless.service.functions.test.package.artifact;
      awsCompileFunctions.serverless.service.functions.test.package.artifact = false;

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        const functionResource =
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources[
            compiledFunctionName
          ];

        const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        const s3FileName = awsCompileFunctions.serverless.service.package.artifact
          .split(path.sep)
          .pop();

        expect(functionResource.Properties.Code.S3Key).to.deep.equal(`${s3Folder}/${s3FileName}`);
        awsCompileFunctions.serverless.service.functions.test.package.artifact = artifactTemp;
      });
    });

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

    it('should use function artifact if individually at function level', () => {
      awsCompileFunctions.serverless.service.functions[functionName].package.individually = true;

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
        awsCompileFunctions.serverless.service.functions[functionName].package = {
          individually: false,
        };
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Role
        ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup', 'LogicalNameRole']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Role
        ).to.deep.equal({
          'Fn::GetAtt': [awsCompileFunctions.serverless.service.provider.role, 'Arn'],
        });
      });
    });

    it('should add a "Fn::GetAtt" Object provider role', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.role = {
        'Fn::GetAtt': ['LogicalRoleName', 'Arn'],
      };
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
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
        ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Role
        ).to.equal(awsCompileFunctions.serverless.service.functions.func.role);
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Func0LambdaFunction.DependsOn
        ).to.deep.equal(['Func0LogGroup']);
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .Func0LambdaFunction.Properties.Role
        ).to.deep.equal(awsCompileFunctions.serverless.service.provider.role);

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

    it('should reject if the function handler is not present', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          name: 'new-service-dev-func',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(Error);
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
          Runtime: 'nodejs12.x',
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

    it('should create a function resource with provider level vpc config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
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
          Runtime: 'nodejs12.x',
          Timeout: 6,
          VpcConfig: {
            SecurityGroupIds: ['xxx'],
            SubnetIds: ['xxx'],
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

    it('should create a function resource with function level vpc config', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
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
          Runtime: 'nodejs12.x',
          Timeout: 6,
          VpcConfig: {
            SecurityGroupIds: ['xxx'],
            SubnetIds: ['xxx'],
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

    it('should create a function resource with provider level tags', () => {
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

      awsCompileFunctions.serverless.service.provider.tags = {
        foo: 'bar',
        baz: 'qux',
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
          Runtime: 'nodejs12.x',
          Timeout: 6,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'baz', Value: 'qux' },
          ],
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should create a function resource with function level tags', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
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
          Runtime: 'nodejs12.x',
          Timeout: 6,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'baz', Value: 'qux' },
          ],
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should create a function resource with provider and function level tags', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
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

      awsCompileFunctions.serverless.service.provider.tags = {
        foo: 'quux',
        corge: 'uier',
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
          Runtime: 'nodejs12.x',
          Timeout: 6,
          Tags: [
            { Key: 'foo', Value: 'bar' },
            { Key: 'corge', Value: 'uier' },
            { Key: 'baz', Value: 'qux' },
          ],
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
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = {
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
              Runtime: 'nodejs12.x',
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
              Runtime: 'nodejs12.x',
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
              Runtime: 'nodejs12.x',
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
              Runtime: 'nodejs12.x',
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
              Runtime: 'nodejs12.x',
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

    describe('when using awsKmsKeyArn config', () => {
      let s3Folder;
      let s3FileName;

      beforeEach(() => {
        s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        s3FileName = awsCompileFunctions.serverless.service.package.artifact.split(path.sep).pop();
      });

      it('should allow if config is provided as a Fn::GetAtt', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            awsKmsKeyArn: {
              'Fn::GetAtt': ['MyKms', 'Arn'],
            },
          },
        };

        const compiledFunction = {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              S3Key: 'somedir/new-service.zip',
            },
            FunctionName: 'new-service-dev-func',
            Handler: 'func.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs12.x',
            Timeout: 6,
            KmsKeyArn: { 'Fn::GetAtt': ['MyKms', 'Arn'] },
          },
          DependsOn: ['FuncLogGroup'],
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
          const compiledCfTemplate =
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;
          const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
          expect(functionResource).to.deep.equal(compiledFunction);
        });
      });

      it('should allow if config is provided as a Ref', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            awsKmsKeyArn: {
              Ref: 'foobar',
            },
          },
        };

        const compiledFunction = {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              S3Key: 'somedir/new-service.zip',
            },
            FunctionName: 'new-service-dev-func',
            Handler: 'func.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs12.x',
            Timeout: 6,
            KmsKeyArn: { Ref: 'foobar' },
          },
          DependsOn: ['FuncLogGroup'],
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
          const compiledCfTemplate =
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;
          const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
          expect(functionResource).to.deep.equal(compiledFunction);
        });
      });

      it('should allow if config is provided as a Fn::ImportValue', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            awsKmsKeyArn: {
              'Fn::ImportValue': 'KmsKey',
            },
          },
        };

        const compiledFunction = {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
              S3Key: 'somedir/new-service.zip',
            },
            FunctionName: 'new-service-dev-func',
            Handler: 'func.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs12.x',
            Timeout: 6,
            KmsKeyArn: { 'Fn::ImportValue': 'KmsKey' },
          },
          DependsOn: ['FuncLogGroup'],
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
          const compiledCfTemplate =
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;
          const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
          expect(functionResource).to.deep.equal(compiledFunction);
        });
      });

      it('should use a the service KMS key arn if provided', () => {
        awsCompileFunctions.serverless.service.serviceObject = {
          name: 'new-service',
          awsKmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
        };

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
            Runtime: 'nodejs12.x',
            Timeout: 6,
            KmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
          const compiledCfTemplate =
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;
          const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
          expect(functionResource).to.deep.equal(compiledFunction);
        });
      });

      it('should prefer a function KMS key arn over a service KMS key arn', () => {
        awsCompileFunctions.serverless.service.serviceObject = {
          name: 'new-service',
          awsKmsKeyArn: 'arn:aws:kms:region:accountid:foo/service',
        };

        awsCompileFunctions.serverless.service.functions = {
          func1: {
            handler: 'func1.function.handler',
            name: 'new-service-dev-func1',
            awsKmsKeyArn: 'arn:aws:kms:region:accountid:foo/function',
          },
          func2: {
            handler: 'func2.function.handler',
            name: 'new-service-dev-func2',
          },
        };

        const compiledFunction1 = {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['Func1LogGroup'],
          Properties: {
            Code: {
              S3Key: `${s3Folder}/${s3FileName}`,
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            },
            FunctionName: 'new-service-dev-func1',
            Handler: 'func1.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs12.x',
            Timeout: 6,
            KmsKeyArn: 'arn:aws:kms:region:accountid:foo/function',
          },
        };

        const compiledFunction2 = {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['Func2LogGroup'],
          Properties: {
            Code: {
              S3Key: `${s3Folder}/${s3FileName}`,
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            },
            FunctionName: 'new-service-dev-func2',
            Handler: 'func2.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs12.x',
            Timeout: 6,
            KmsKeyArn: 'arn:aws:kms:region:accountid:foo/service',
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
          const compiledCfTemplate =
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

          const function1Resource = compiledCfTemplate.Resources.Func1LambdaFunction;
          const function2Resource = compiledCfTemplate.Resources.Func2LambdaFunction;
          expect(function1Resource).to.deep.equal(compiledFunction1);
          expect(function2Resource).to.deep.equal(compiledFunction2);
        });
      });

      describe('when IamRoleLambdaExecution is used', () => {
        beforeEach(() => {
          // pretend that the IamRoleLambdaExecution is used
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = {
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

        it('should create necessary resources if a KMS key arn is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              awsKmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
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
              Runtime: 'nodejs12.x',
              Timeout: 6,
              KmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
            },
          };

          const compiledKmsStatement = {
            Effect: 'Allow',
            Action: ['kms:Decrypt'],
            Resource: ['arn:aws:kms:region:accountid:foo/bar'],
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
            const compiledCfTemplate =
              awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            const dlqStatement =
              compiledCfTemplate.Resources.IamRoleLambdaExecution.Properties.Policies[0]
                .PolicyDocument.Statement[0];

            expect(functionResource).to.deep.equal(compiledFunction);
            expect(dlqStatement).to.deep.equal(compiledKmsStatement);
          });
        });
      });

      describe('when IamRoleLambdaExecution is not used', () => {
        it('should create necessary function resources if a KMS key arn is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              awsKmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
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
              Runtime: 'nodejs12.x',
              Timeout: 6,
              KmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
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

      it('should use a the provider wide tracing config if provided', () => {
        Object.assign(awsCompileFunctions.serverless.service.provider, {
          tracing: {
            lambda: true,
          },
        });

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
            Runtime: 'nodejs12.x',
            Timeout: 6,
            TracingConfig: {
              Mode: 'Active',
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

      it('should prefer a function tracing config over a provider config', () => {
        Object.assign(awsCompileFunctions.serverless.service.provider, {
          tracing: {
            lambda: 'PassThrough',
          },
        });

        awsCompileFunctions.serverless.service.functions = {
          func1: {
            handler: 'func1.function.handler',
            name: 'new-service-dev-func1',
            tracing: 'Active',
          },
          func2: {
            handler: 'func2.function.handler',
            name: 'new-service-dev-func2',
          },
        };

        const compiledFunction1 = {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['Func1LogGroup'],
          Properties: {
            Code: {
              S3Key: `${s3Folder}/${s3FileName}`,
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            },
            FunctionName: 'new-service-dev-func1',
            Handler: 'func1.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs12.x',
            Timeout: 6,
            TracingConfig: {
              Mode: 'Active',
            },
          },
        };

        const compiledFunction2 = {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['Func2LogGroup'],
          Properties: {
            Code: {
              S3Key: `${s3Folder}/${s3FileName}`,
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            },
            FunctionName: 'new-service-dev-func2',
            Handler: 'func2.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs12.x',
            Timeout: 6,
            TracingConfig: {
              Mode: 'PassThrough',
            },
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
          const compiledCfTemplate =
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate;

          const function1Resource = compiledCfTemplate.Resources.Func1LambdaFunction;
          const function2Resource = compiledCfTemplate.Resources.Func2LambdaFunction;
          expect(function1Resource).to.deep.equal(compiledFunction1);
          expect(function2Resource).to.deep.equal(compiledFunction2);
        });
      });

      describe('when IamRoleLambdaExecution is used', () => {
        beforeEach(() => {
          // pretend that the IamRoleLambdaExecution is used
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = {
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
              Runtime: 'nodejs12.x',
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

      describe('when IamRoleLambdaExecution is not used', () => {
        it('should create necessary resources if a tracing config is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              tracing: 'PassThrough',
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
              Runtime: 'nodejs12.x',
              Timeout: 6,
              TracingConfig: {
                Mode: 'PassThrough',
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

    it('should create a function resource with environment config', () => {
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
            test2: 'test2',
          },
        },
      };

      awsCompileFunctions.serverless.service.provider.environment = {
        providerTest1: 'providerTest1',
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
          Runtime: 'nodejs12.x',
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
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
          Runtime: 'nodejs12.x',
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

    it('should create a function resource with provider level environment config', () => {
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

      awsCompileFunctions.serverless.service.provider.environment = {
        providerTest1: 'providerTest1',
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
          Runtime: 'nodejs12.x',
          Timeout: 6,
          Environment: {
            Variables: {
              providerTest1: 'providerTest1',
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

    it('should overwrite a provider level environment config when function config is given', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
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
          Runtime: 'nodejs12.x',
          Timeout: 6,
          Environment: {
            Variables: {
              variable: 'overwritten',
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

    it('should accept an environment variable with a not-string value', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          environment: {
            counter: 18,
          },
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction.Properties.Environment.Variables.counter
        ).to.equal(18);
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
          Runtime: 'nodejs12.x',
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

    it(
      'should allow functions to use a different runtime' +
        ' than the service default runtime if specified',
      () => {
        const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        const s3FileName = awsCompileFunctions.serverless.service.package.artifact
          .split(path.sep)
          .pop();
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            runtime: 'python2.7',
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
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
              Runtime: 'python2.7',
              Timeout: 6,
            },
          };

          expect(
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
              .FuncLambdaFunction
          ).to.deep.equal(compiledFunction);
        });
      }
    );

    it('should default to the nodejs12.x runtime when no provider runtime is given', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
      awsCompileFunctions.serverless.service.provider.runtime = null;
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
          Runtime: 'nodejs12.x',
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

    it('should consider the providers runtime and memorySize when creating a function resource', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
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
        DependsOn: ['FuncLogGroup'],
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Resources
            .FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should use a custom bucket if specified', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep)
        .pop();
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
        DependsOn: ['FuncLogGroup'],
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
        path.join(__dirname, '..', '..', 'lib', 'core-cloudformation-template.json')
      );
      awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate = coreCloudFormationTemplate;

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

          _.set(
            awsCompileFunctions,
            'serverless.service.functions.func.environment.MY_ENV_VAR',
            'myvalue'
          );

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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled.then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate.Outputs
        ).to.deep.equal(expectedOutputs);
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
          Runtime: 'nodejs12.x',
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
          Runtime: 'nodejs12.x',
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

    it('should version only function that is flagged to be versioned', () => {
      awsCompileFunctions.serverless.service.provider.versionFunctions = false;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          versionFunction: true,
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
        ).to.not.exist;
      });
    });
  });

  describe('#compileRole()', () => {
    it('adds the default role without DependsOn values', () => {
      const role = 'IamRoleLambdaExecution';
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        Properties: {
          Role: {
            'Fn::GetAtt': [role, 'Arn'],
          },
        },
      });
    });

    it('adds a role based on a logical name with DependsOn values', () => {
      const role = 'LogicalRoleName';
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        DependsOn: [role],
        Properties: {
          Role: {
            'Fn::GetAtt': [role, 'Arn'],
          },
        },
      });
    });

    it('adds a role based on a Fn::GetAtt with DependsOn values', () => {
      const role = { 'Fn::GetAtt': ['Foo', 'Arn'] };
      const resource = { Properties: {} };
      awsCompileFunctions.compileRole(resource, role);

      expect(resource).to.deep.equal({
        DependsOn: ['Foo'],
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
          Runtime: 'nodejs12.x',
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
          Runtime: 'nodejs12.x',
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

describe('AwsCompileFunctions #2', () => {
  describe('Asynchronous Invocations', () => {
    it('Should reference function from same service as destination', () =>
      runServerless({
        fixture: 'functionDestinations',
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const destinationConfig =
          cfResources[naming.getLambdaEventConfigLogicalId('trigger')].Properties.DestinationConfig;

        expect(destinationConfig).to.deep.equal({
          OnSuccess: {
            Destination: { 'Fn::GetAtt': [naming.getLambdaLogicalId('target'), 'Arn'] },
          },
        });
        expect(destinationConfig).to.not.have.property('OnFailure');
      }));

    it('Should support OnFailure destinations', () =>
      runServerless({
        fixture: 'functionDestinations',
        configExt: {
          functions: { trigger: { destinations: { onSuccess: null, onFailure: 'target' } } },
        },
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const destinationConfig =
          cfResources[naming.getLambdaEventConfigLogicalId('trigger')].Properties.DestinationConfig;

        expect(destinationConfig).to.not.have.property('OnSuccess');
        expect(destinationConfig).to.deep.equal({
          OnFailure: {
            Destination: { 'Fn::GetAtt': [naming.getLambdaLogicalId('target'), 'Arn'] },
          },
        });
      }));

    it('Should support ARN to external function as destination', () => {
      const arn = 'arn:aws:lambda:us-east-1:12313231:function:external';
      return runServerless({
        fixture: 'functionDestinations',
        configExt: {
          functions: { trigger: { destinations: { onSuccess: arn } } },
        },
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const destinationConfig =
          cfResources[naming.getLambdaEventConfigLogicalId('trigger')].Properties.DestinationConfig;

        expect(destinationConfig).to.deep.equal({ OnSuccess: { Destination: arn } });
      });
    });

    it('Should respect `role` setting', () =>
      runServerless({
        fixture: 'functionDestinations',
        configExt: { provider: { role: ' arn:aws:iam::XXXXXX:role/role' } },
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const destinationConfig =
          cfResources[naming.getLambdaEventConfigLogicalId('trigger')].Properties.DestinationConfig;

        expect(destinationConfig).to.deep.equal({
          OnSuccess: {
            Destination: { 'Fn::GetAtt': [naming.getLambdaLogicalId('target'), 'Arn'] },
          },
        });
        expect(destinationConfig).to.not.have.property('OnFailure');
      }));

    it('Should not have logGroup in depends on if disableLogs is true', () => {
      return runServerless({
        fixture: 'function',
        configExt: { functions: { foo: { disableLogs: true } } },
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const dependsOn = cfResources[naming.getLambdaLogicalId('foo')].DependsOn;
        expect(dependsOn).to.be.undefined;
      });
    });

    it('Should support maximumEventAge defined on function', () => {
      const maximumEventAge = 3600;
      return runServerless({
        fixture: 'function',
        configExt: {
          functions: { foo: { maximumEventAge } },
        },
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const eventInvokeConfig =
          cfResources[naming.getLambdaEventConfigLogicalId('foo')].Properties;

        expect(eventInvokeConfig.MaximumEventAgeInSeconds).to.equal(maximumEventAge);
      });
    });

    it('Should support maximumRetryAttempts defined on function', () => {
      const maximumRetryAttempts = 0;
      return runServerless({
        fixture: 'function',
        configExt: {
          functions: { foo: { maximumRetryAttempts } },
        },
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const eventInvokeConfig =
          cfResources[naming.getLambdaEventConfigLogicalId('foo')].Properties;

        expect(eventInvokeConfig.MaximumRetryAttempts).to.equal(maximumRetryAttempts);
      });
    });
  });

  describe('when using fileSystemConfig', () => {
    const arn =
      'arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-a1a1a1a1a1a1a1a1a';
    const localMountPath = '/mnt/path';
    const securityGroupIds = ['sg-0a0a0a0a'];
    const subnetIds = ['subnet-01010101'];

    let functionConfig;
    let defaultIamRole;

    before(() =>
      runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              vpc: {
                subnetIds,
                securityGroupIds,
              },
              fileSystemConfig: {
                localMountPath,
                arn,
              },
            },
          },
        },
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        functionConfig = cfTemplate.Resources[awsNaming.getLambdaLogicalId('foo')].Properties;
        defaultIamRole = cfTemplate.Resources.IamRoleLambdaExecution;
      })
    );

    it('should correctly set Arn and LocalMountPath', () => {
      expect(functionConfig.FileSystemConfigs).to.deep.equal([
        {
          Arn: arn,
          LocalMountPath: localMountPath,
        },
      ]);
    });

    it('should update default IAM role', () => {
      expect(defaultIamRole.Properties.Policies[0].PolicyDocument.Statement).to.deep.include({
        Effect: 'Allow',
        Action: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
        Resource: [arn],
      });
    });

    it('should support vpc defined on provider level', () => {
      return runServerless({
        fixture: 'function',
        configExt: {
          provider: {
            vpc: {
              subnetIds,
              securityGroupIds,
            },
          },
          functions: {
            foo: {
              fileSystemConfig: {
                localMountPath,
                arn,
              },
            },
          },
        },
        cliArgs: ['package'],
      }).then(({ cfTemplate, awsNaming }) => {
        const cfResources = cfTemplate.Resources;
        const naming = awsNaming;
        const fnConfig = cfResources[naming.getLambdaLogicalId('foo')].Properties;

        expect(fnConfig.FileSystemConfigs).to.deep.equal([
          {
            Arn: arn,
            LocalMountPath: localMountPath,
          },
        ]);
      });
    });

    it('should throw error when function has no vpc configured', () => {
      return runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              fileSystemConfig: {
                localMountPath,
                arn,
              },
            },
          },
        },
        cliArgs: ['package'],
      }).catch(error => {
        expect(error).to.have.property('code', 'LAMBDA_FILE_SYSTEM_CONFIG_MISSING_VPC');
      });
    });
  });

  describe('when function versions are used with layers', () => {
    let firstCfTemplate;
    let servicePath;
    let updateConfig;
    const mockDescribeStackResponse = {
      CloudFormation: {
        describeStacks: { Stacks: [{ Outputs: [{ OutputKey: 'test' }] }] },
      },
    };

    beforeEach(async () => {
      const serviceData = await fixtures.setup('functionLayers');
      ({ servicePath, updateConfig } = serviceData);
      const data = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
        awsRequestStubMap: mockDescribeStackResponse,
      });
      firstCfTemplate = data.cfTemplate;
    });

    it('should create different version ids for identical lambdas with and without layers', () => {
      expect(firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref).to.not.equal(
        firstCfTemplate.Outputs.NoLayerFuncLambdaFunctionQualifiedArn.Value.Ref
      );
    });

    it('should generate different lambda version id when lambda layer properties are different', async () => {
      const firstVersionId = firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

      await updateConfig({
        layers: { testLayer: { path: 'testLayer', description: 'Different description' } },
      });

      const data = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
        awsRequestStubMap: mockDescribeStackResponse,
      });

      expect(firstVersionId).to.not.equal(
        data.cfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
      );
    });

    it('should ignore changing character of S3Key paths when generating layer version id', async () => {
      // the S3Key path is timestamped and so changes on every deployment regardless of layer changes, and should
      // therefore not be included in the version id digest
      const firstVersionId = firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;
      const firstS3Key = firstCfTemplate.Resources.TestLayerLambdaLayer.Properties.Content.S3Key;

      const data = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
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
      const firstVersionId = firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

      await updateConfig({
        functions: {
          layerFunc: { layers: [{ Ref: 'TestLayerLambdaLayer' }], handler: 'index.handler' },
        },
      });

      const data = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
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
        cwd: servicePath,
        cliArgs: ['package'],
        awsRequestStubMap: mockDescribeStackResponse,
      });

      expect(firstVersionId).to.not.equal(
        data.cfTemplate.Outputs.LayerFuncWithConfigLambdaFunctionQualifiedArn.Value.Ref
      );
    });

    it('should create same version id when layer source and config are unchanged', async () => {
      const firstVersionId = firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

      const data = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
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
        cwd: servicePath,
        cliArgs: ['package'],
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
        originalLayer = path.join(servicePath, 'testLayer');
        sourceChangeLayer = path.join(servicePath, 'extra_layers', 'testLayerSourceChange');
        backupLayer = path.join(servicePath, 'extra_layers', 'testLayerBackup');

        await fse.rename(originalLayer, backupLayer);
        await fse.rename(sourceChangeLayer, originalLayer);
      });

      afterEach(async () => {
        await fse.rename(originalLayer, sourceChangeLayer);
        await fse.rename(backupLayer, originalLayer);
      });

      it('should create different lambda version id', async () => {
        const firstVersionId =
          firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

        const data = await runServerless({
          cwd: servicePath,
          cliArgs: ['package'],
          awsRequestStubMap: mockDescribeStackResponse,
        });

        expect(firstVersionId).to.not.equal(
          data.cfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref
        );
      });
    });
  });

  describe('function config', () => {
    it('should not create a new version object if only function-wide configuration changed', async () => {
      const { servicePath, updateConfig } = await fixtures.setup('function');

      const { cfTemplate: originalTemplate } = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
      });
      const originalVersionArn = originalTemplate.Outputs.FooLambdaFunctionQualifiedArn.Value.Ref;

      await updateConfig({
        functions: {
          foo: {
            tags: {
              foo: 'bar',
            },
            reservedConcurrency: 1,
          },
        },
      });
      const { cfTemplate: updatedTemplate } = await runServerless({
        cwd: servicePath,
        cliArgs: ['package'],
      });
      const updatedVersionArn = updatedTemplate.Outputs.FooLambdaFunctionQualifiedArn.Value.Ref;

      expect(
        updatedTemplate.Resources.FooLambdaFunction.Properties.ReservedConcurrentExecutions
      ).to.equal(1);

      expect(originalVersionArn).to.equal(updatedVersionArn);
    });
  });
});
