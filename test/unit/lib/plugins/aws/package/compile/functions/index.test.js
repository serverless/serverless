'use strict';

const AWS = require('aws-sdk');
const fse = require('fs-extra');
const _ = require('lodash');
const path = require('path');
const chai = require('chai');
const sinon = require('sinon');
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider/awsProvider');
const AwsCompileFunctions = require('../../../../../../../../lib/plugins/aws/package/compile/functions/index');
const Serverless = require('../../../../../../../../lib/Serverless');
const runServerless = require('../../../../../../../utils/run-serverless');
const fixtures = require('../../../../../../../fixtures');

const { getTmpDirPath, createTmpFile } = require('../../../../../../../utils/fs');

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
        path.resolve(
          __dirname,
          '../../../../../../../../lib/plugins/aws/package/lib/core-cloudformation-template.json'
        )
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

describe('lib/plugins/aws/package/compile/functions/index.test.js', () => {
  describe('Provider properties', () => {
    let cfResources;
    let naming;
    let serviceConfig;
    let iamRolePolicyStatements;

    before(async () => {
      const { awsNaming, cfTemplate, fixtureData } = await runServerless({
        fixture: 'function',
        cliArgs: ['package'],
        configExt: {
          provider: {
            vpc: {
              subnetIds: ['subnet-01010101'],
              securityGroupIds: ['sg-0a0a0a0a'],
            },
          },
          functions: {
            fnFileSystemConfig: {
              handler: 'index.handler',
              fileSystemConfig: {
                localMountPath: '/mnt/path',
                arn:
                  'arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-a1a1a1a1a1a1a1a1a',
              },
            },
          },
        },
      });
      cfResources = cfTemplate.Resources;
      naming = awsNaming;
      serviceConfig = fixtureData.serviceConfig;
      iamRolePolicyStatements =
        cfResources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement;
    });

    it.skip('TODO: should support `package.artifact`', async () => {
      // Replacement for:
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L149-L168
    });

    it.skip('TODO: should ignore `package.artifact` when packaging individually', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L190-L211
    });

    it.skip('TODO: should support `provider.role` as arn string', async () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L213-L233
      //
      // Confirm that provider.role ends at Function.Properties.Role
    });

    it.skip('TODO: should prefer `functions[].role` over `provider.role`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L377-L398
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L436-L470
    });

    it.skip('TODO: should support `provider.vpc`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L518-L561
      //
      // Confirm on VpcConfig property
    });

    it.skip('TODO: should prefer `functions[].vpc` over `provider.vpc`', () => {});

    it.skip('TODO: should support `provider.tags`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L607-L651
    });

    it.skip('TODO: should support both `provider.tags and `function[].tags`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L698-L747
    });

    it.skip('TODO: should support `service.awsKmsKeyArn`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1112-L1149
    });

    it.skip('TODO: should prefer `functions[].awsKmsKeyArn` over `service.awsKmsKeyArn`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1151-L1214
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1281-L1316
    });

    it.skip('TODO: should support `provider.tracing.lambda`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1329-L1369
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1457-L1504
      //
      // Confirm on TrancingConfig property
    });

    it.skip('TODO: should prefer `functions[].tracing` over `provider.tracing.lambda`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1371-L1439
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1508-L1546
    });

    it.skip('TODO: should support `provider.environment`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1646-L1690
    });

    it.skip('TODO: should prefer `functions[].environment` over `provider.environment`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1549-L1599
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1692-L1739
    });

    it.skip('TODO: should support `provider.memorySize`', () => {
      // Partial replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1901-L1937
    });

    it.skip('TODO: should prefer `functions[].memorySize` over `provider.memorySize`', () => {});

    it.skip('TODO: should support `provider.runtime`', () => {
      // Partial replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1901-L1937
    });

    it.skip('TODO: should prefer `functions[].runtime` over `provider.runtime`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1822-L1862
    });

    it.skip('TODO: should support `provider.versionFunctions: false`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2082-L2100
    });

    it.skip('TODO: should prefer `functions[].versionFunction` over `provider.versionFunctions`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2196-L2218
    });

    it.skip('TODO: should support `package.deploymentBucket`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1939-L1982
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
  });

  describe.skip('TODO: `provider.role` variants', () => {
    // After addressing remove also:
    // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2222-L2286

    it('should support resource name', async () => {
      await runServerless({ fixture: 'function', configExt: {} });
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L235-L257
      //
      // Confirm that provider.role is refereenced at Function.Properties.Role
      // and that it's added to function DependsOn
    });

    it('should support Fn::GetAtt function', async () => {
      await runServerless({ fixture: 'function', configExt: {} });
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L259-L281
      //
      // Confirm that provider.role is refereenced at Function.Properties.Role
      // and that it's added to function DependsOn
    });
  });

  describe('Function properties', () => {
    let cfResources;
    let naming;
    let serverless;
    let serviceConfig;
    let iamRolePolicyStatements;

    before(async () => {
      const {
        awsNaming,
        cfTemplate,
        serverless: serverlessInstance,
        fixtureData,
      } = await runServerless({
        fixture: 'functionDestinations',
        cliArgs: ['package'],
        configExt: {
          functions: {
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
                arn:
                  'arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-a1a1a1a1a1a1a1a1a',
              },
            },
            fnImage: {
              image:
                '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
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
      // Confirm on TrancingConfig property
      // Confirm also on needed IAM policies
    });

    it.skip('TODO: should support `functions[].onError` as arn', () => {
      // Replacment for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L774-L821
      //
      // Confirm on Function `DeadLetterConfig` property and on IAM policy statement being added
    });

    it.skip('TODO: should support `functions[].onError` as Ref', () => {
      // Replacment for
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

    it.skip('TODO: should support `functions[].awsKmsKeyArn` as arn string', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1232-L1278
      //
      // Confirm also that IAM policy statement was added
    });
    it.skip('TODO: should support `functions[].awsKmsKeyArn` as Fn::GetAtt', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1001-L1036
    });

    it.skip('TODO: should support `functions[].awsKmsKeyArn` as Ref', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1038-L1073
    });

    it.skip('TODO: should support `functions[].awsKmsKeyArn` as Fn::ImportValue', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1075-L1110
    });

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

    it.skip('TODO: should default to "nodejs12.x" runtime`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L1864-L1899
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

    it.skip('TODO: should support `functions[].conditions`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2364-L2379
    });

    it.skip('TODO: should support `functions[].dependsOn`', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2381-L2397
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

    it('should support `functions[].image`', () => {
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
        resource =>
          resource.Type === 'AWS::Lambda::Version' &&
          resource.Properties.FunctionName.Ref === functionCfLogicalId
      ).Properties;
      expect(versionCfConfig.CodeSha256).to.equal(imageDigestSha);
    });
  });

  describe('Validation', () => {
    it('should throw error when `functions[].fileSystemConfig` is configured with no vpc', () => {
      return runServerless({
        fixture: 'function',
        configExt: {
          functions: {
            foo: {
              fileSystemConfig: {
                localMountPath: '/mnt/path',
                arn:
                  'arn:aws:elasticfilesystem:us-east-1:111111111111:access-point/fsap-a1a1a1a1a1a1a1a1a',
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

  describe('Version hash resolution', () => {
    it.skip('TODO: should create a different version if configuration changed', () => {
      // Replacement for
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/compile/functions/index.test.js#L2022-L2057
      //
      // Configure in similar fashion as test below
    });

    it('should not create a different version if only function-wide configuration changed', async () => {
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

    describe('with layers', () => {
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
        const firstVersionId =
          firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

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
        const firstVersionId =
          firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;
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
        const firstVersionId =
          firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

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
        const firstVersionId =
          firstCfTemplate.Outputs.LayerFuncLambdaFunctionQualifiedArn.Value.Ref;

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
  });

  describe.skip('TODO: Download package artifact from S3 bucket', () => {
    before(async () => {
      await runServerless({
        fixture: 'packageArtifact',
        cliArgs: ['deploy'],
        configExt: {
          package: { artifact: 'some s3 url' },
          functions: { foo: { package: { individually: true, artifact: 'other s3 url' } } },
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
      // Test with ["deploy"] cliArgs, and configure `lastLifecycleHookName` to 'aws:deploy:deploy:uploadArtifact'
      // It'll demand stubbing few other AWS calls for that follow this stub:
      // https://github.com/serverless/enterprise-plugin/blob/cdd53df45dfad18d8bdd79969194a61cb8178671/lib/deployment/parse.test.js#L1585-L1627
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
