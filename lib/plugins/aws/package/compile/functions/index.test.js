'use strict';

const _ = require('lodash');
const path = require('path');
const chai = require('chai');
const AwsProvider = require('../../../provider/awsProvider');
const AwsCompileFunctions = require('./index');
const testUtils = require('../../../../../../tests/utils');
const Serverless = require('../../../../../Serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

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
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.cli = new serverless.classes.CLI();
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

  describe('#isArnRefGetAttOrImportValue()', () => {
    it('should accept a Ref', () =>
     expect(awsCompileFunctions.isArnRefGetAttOrImportValue({ Ref: 'DLQ' })).to.equal(true));
    it('should accept a Fn::GetAtt', () =>
     expect(awsCompileFunctions.isArnRefGetAttOrImportValue({ 'Fn::GetAtt': ['DLQ', 'Arn'] }))
        .to.equal(true));
    it('should accept a Fn::ImportValue', () =>
      expect(awsCompileFunctions.isArnRefGetAttOrImportValue({ 'Fn::ImportValue': 'DLQ' }))
        .to.equal(true));
    it('should reject other objects', () =>
      expect(awsCompileFunctions.isArnRefGetAttOrImportValue({ Blah: 'vtha' })).to.equal(false));
  });

  describe('#compileFunctions()', () => {
    it('should use service artifact if not individually', () => {
      awsCompileFunctions.serverless.service.package.individually = false;
      const artifactTemp = awsCompileFunctions.serverless.service.functions.test.package.artifact;
      awsCompileFunctions.serverless.service.functions.test.package.artifact = false;

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[compiledFunctionName];

        const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();

        expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
        awsCompileFunctions.serverless.service.functions.test.package.artifact = artifactTemp;
      });
    });

    it('should use function artifact if individually', () => {
      awsCompileFunctions.serverless.service.package.individually = true;

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        const functionResource = awsCompileFunctions.serverless.service.provider
          .compiledCloudFormationTemplate.Resources[compiledFunctionName];

        const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        const s3FileName = awsCompileFunctions.serverless.service
          .functions[functionName].package.artifact.split(path.sep).pop();

        expect(functionResource.Properties.Code.S3Key)
          .to.deep.equal(`${s3Folder}/${s3FileName}`);
      });
    });

    it('should use function artifact if individually at function level', () => {
      awsCompileFunctions.serverless.service.functions[functionName].package.individually = true;

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Role
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup', 'LogicalRoleName']);
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Role
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Role
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.DependsOn
        ).to.deep.equal(['FuncLogGroup', 'LogicalRoleName']);
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Role
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Role
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.DependsOn).to.deep.equal(['FuncLogGroup']);
        expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Role
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
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
    });

    it('should reject if the function handler is not present', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          name: 'new-service-dev-func',
        },
      };

      expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(Error);
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should create a function resource with provider level tags', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should create a function resource with function level tags', () => {
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should create a function resource with provider and function level tags', () => {
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

      awsCompileFunctions.serverless.service.provider.tags = {
        foo: 'quux',
        corge: 'uier',
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
            { Key: 'corge', Value: 'uier' },
            { Key: 'baz', Value: 'qux' },
          ],
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    describe('when using onError config', () => {
      let s3Folder;
      let s3FileName;

      beforeEach(() => {
        s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        s3FileName = awsCompileFunctions.serverless.service.package.artifact
          .split(path.sep).pop();
      });

      it('should reject if config is provided as a number', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            onError: 12,
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(Error);
      });

      it('should reject if config is provided as an object', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            onError: {
              foo: 'bar',
            },
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(Error);
      });

      it('should reject if config is not a SNS or SQS arn', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            onError: 'foo',
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(Error);
      });

      describe('when IamRoleLambdaExecution is used', () => {
        beforeEach(() => {
          // pretend that the IamRoleLambdaExecution is used
          awsCompileFunctions.serverless.service.provider
            .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = {
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
              DeadLetterConfig: {
                TargetArn: 'arn:aws:sns:region:accountid:foo',
              },
            },
          };

          const compiledDlqStatement = {
            Effect: 'Allow',
            Action: [
              'sns:Publish',
            ],
            Resource: ['arn:aws:sns:region:accountid:foo'],
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
          .then(() => {
            const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
              .compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            const dlqStatement = compiledCfTemplate.Resources
              .IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[0];

            expect(functionResource).to.deep.equal(compiledFunction);
            expect(dlqStatement).to.deep.equal(compiledDlqStatement);
          });
        });

        it('should throw an informative error message if a SQS arn is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              onError: 'arn:aws:sqs:region:accountid:foo',
            },
          };

          return expect(awsCompileFunctions.compileFunctions())
            .to.be.rejectedWith('only supports SNS');
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
              DeadLetterConfig: {
                TargetArn: {
                  Ref: 'DLQ',
                },
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
          .then(() => {
            const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
              .compiledCloudFormationTemplate;

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
              DeadLetterConfig: {
                TargetArn: {
                  'Fn::ImportValue': 'DLQ',
                },
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
          .then(() => {
            const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
              .compiledCloudFormationTemplate;

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
              DeadLetterConfig: {
                TargetArn: {
                  'Fn::GetAtt': ['DLQ', 'Arn'],
                },
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
          .then(() => {
            const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
              .compiledCloudFormationTemplate;

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
              DeadLetterConfig: {
                TargetArn: 'arn:aws:sns:region:accountid:foo',
              },
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
          .then(() => {
            const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
              .compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;

            expect(functionResource).to.deep.equal(compiledFunction);
          });
        });

        it('should reject with an informative error message if a SQS arn is provided', () => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              onError: 'arn:aws:sqs:region:accountid:foo',
            },
          };

          return expect(awsCompileFunctions.compileFunctions())
            .to.be.rejectedWith('only supports SNS');
        });
      });
    });

    describe('when using awsKmsKeyArn config', () => {
      let s3Folder;
      let s3FileName;

      beforeEach(() => {
        s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
        s3FileName = awsCompileFunctions.serverless.service.package.artifact
          .split(path.sep).pop();
      });

      it('should reject if config is provided as a number', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            awsKmsKeyArn: 12,
          },
        };

        return expect(awsCompileFunctions.compileFunctions())
          .to.be.rejectedWith('provided as a string');
      });

      it('should reject if config is provided as an object', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            awsKmsKeyArn: {
              foo: 'bar',
            },
          },
        };

        return expect(awsCompileFunctions.compileFunctions())
          .to.be.rejectedWith('provided as a string');
      });

      it('should throw an error if config is not a KMS key arn', () => {
        awsCompileFunctions.serverless.service.functions = {
          func: {
            handler: 'func.function.handler',
            name: 'new-service-dev-func',
            awsKmsKeyArn: 'foo',
          },
        };

        return expect(awsCompileFunctions.compileFunctions())
          .to.be.rejectedWith('KMS key arn');
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
            KmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
        .then(() => {
          const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
            .compiledCloudFormationTemplate;
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
          DependsOn: [
            'Func1LogGroup',
            'IamRoleLambdaExecution',
          ],
          Properties: {
            Code: {
              S3Key: `${s3Folder}/${s3FileName}`,
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            },
            FunctionName: 'new-service-dev-func1',
            Handler: 'func1.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs4.3',
            Timeout: 6,
            KmsKeyArn: 'arn:aws:kms:region:accountid:foo/function',
          },
        };

        const compiledFunction2 = {
          Type: 'AWS::Lambda::Function',
          DependsOn: [
            'Func2LogGroup',
            'IamRoleLambdaExecution',
          ],
          Properties: {
            Code: {
              S3Key: `${s3Folder}/${s3FileName}`,
              S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            },
            FunctionName: 'new-service-dev-func2',
            Handler: 'func2.function.handler',
            MemorySize: 1024,
            Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
            Runtime: 'nodejs4.3',
            Timeout: 6,
            KmsKeyArn: 'arn:aws:kms:region:accountid:foo/service',
          },
        };

        return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
        .then(() => {
          const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
            .compiledCloudFormationTemplate;

          const function1Resource = compiledCfTemplate.Resources.Func1LambdaFunction;
          const function2Resource = compiledCfTemplate.Resources.Func2LambdaFunction;
          expect(function1Resource).to.deep.equal(compiledFunction1);
          expect(function2Resource).to.deep.equal(compiledFunction2);
        });
      });

      describe('when IamRoleLambdaExecution is used', () => {
        beforeEach(() => {
          // pretend that the IamRoleLambdaExecution is used
          awsCompileFunctions.serverless.service.provider
            .compiledCloudFormationTemplate.Resources.IamRoleLambdaExecution = {
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
              KmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
            },
          };

          const compiledKmsStatement = {
            Effect: 'Allow',
            Action: [
              'kms:Decrypt',
            ],
            Resource: ['arn:aws:kms:region:accountid:foo/bar'],
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
          .then(() => {
            const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
              .compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;
            const dlqStatement = compiledCfTemplate.Resources
              .IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[0];

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
              KmsKeyArn: 'arn:aws:kms:region:accountid:foo/bar',
            },
          };

          return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
          .then(() => {
            const compiledCfTemplate = awsCompileFunctions.serverless.service.provider
              .compiledCloudFormationTemplate;

            const functionResource = compiledCfTemplate.Resources.FuncLambdaFunction;

            expect(functionResource).to.deep.equal(compiledFunction);
          });
        });
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(Error);
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(awsCompileFunctions.serverless.service.provider
          .compiledCloudFormationTemplate
          .Resources.FuncLambdaFunction.Properties.Environment.Variables.counter
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
        .then(() => {
          awsCompileFunctions.serverless.service.functions = {
            func: {
              handler: 'func.function.handler',
              name: 'new-service-dev-func',
              environment: {
                counter: {
                  NotRef: 'TestVariable',
                },
              },
            },
          };
          return expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(Error);
        });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction.Properties.Description
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

      const expectedOutputs = {
        FuncLambdaFunctionQualifiedArn: {
          Description: 'Current Lambda function version',
          Value: { Ref: 'FuncLambdaVersionl6Rjpaz0gycgsEDI51sLed039fH2uR4W8Q2IW8cNo' },
        },
        AnotherFuncLambdaFunctionQualifiedArn: {
          Description: 'Current Lambda function version',
          Value: {
            Ref: 'AnotherFuncLambdaVersion6JZQneYqP4bC0Z3ywMc3XJPyECHK4RMGhpv8iis4E',
          },
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs
        ).to.deep.equal(
          expectedOutputs
        );
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

      const expectedOutputs = {
        FuncLambdaFunctionQualifiedArn: {
          Description: 'Current Lambda function version',
          Value: { Ref: 'FuncLambdaVersionl6Rjpaz0gycgsEDI51sLed039fH2uR4W8Q2IW8cNo' },
        },
        AnotherFuncLambdaFunctionQualifiedArn: {
          Description: 'Current Lambda function version',
          Value: {
            Ref: 'AnotherFuncLambdaVersion6JZQneYqP4bC0Z3ywMc3XJPyECHK4RMGhpv8iis4E',
          },
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs
        ).to.deep.equal(
          expectedOutputs
        );

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
        // Expect different version hash
        _.set(
          expectedOutputs,
          'FuncLambdaFunctionQualifiedArn',
          {
            Description: 'Current Lambda function version',
            Value: { Ref: 'FuncLambdaVersiona6VymfU25aF6eS2qysm7sHqPyy8RqYUzoTvDeBrrBA' },
          }
        );

        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs
        ).to.deep.equal(
          expectedOutputs
        );
      });
    });

    it('should include description under version too if function is specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          description: 'Lambda function description',
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaVersionOKy3yjVllZnozzdvQqHlRN8lBwkZyA6l76TCAEyork
          .Properties.Description
        ).to.equal('Lambda function description');
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs
        ).to.deep.equal(
          expectedOutputs
        );
      });
    });

    it('should set function declared reserved concurrency limit', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          reservedConcurrency: 5,
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
          ReservedConcurrentExecutions: 5,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
        .then(() => {
          expect(
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
              .Resources.FuncLambdaFunction
          ).to.deep.equal(compiledFunction);
        });
    });

    it('should set function declared reserved concurrency limit even if it is zero', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          reservedConcurrency: 0,
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
          ReservedConcurrentExecutions: 0,
          Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
        .then(() => {
          expect(
            awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
              .Resources.FuncLambdaFunction
          ).to.deep.equal(compiledFunction);
        });
    });

    it('should throw an informative error message if non-integer reserved concurrency limit set ' +
      'on function', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          reservedConcurrency: 'a',
        },
      };

      const errorMessage = [
        'You should use integer as reservedConcurrency value on function: ',
        'new-service-dev-func',
      ].join('');

      return expect(awsCompileFunctions.compileFunctions()).to.be.rejectedWith(errorMessage);
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

    it('should not set unset properties when not specified in yml (layers, vpc, etc)', () => {
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

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });

    it('should set Layers when specified', () => {
      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
        .split(path.sep).pop();

      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          layers: ['arn:aws:xxx:*:*'],
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
          Layers: ['arn:aws:xxx:*:*'],
        },
      };

      return expect(awsCompileFunctions.compileFunctions()).to.be.fulfilled
      .then(() => {
        expect(
          awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.FuncLambdaFunction
        ).to.deep.equal(compiledFunction);
      });
    });
  });
});
