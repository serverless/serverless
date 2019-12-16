'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const fse = require('fs-extra');
const { execSync } = require('../utils/child-process');
const serverlessExec = require('../serverless-binary');
const { getTmpDirPath } = require('../utils/fs');

const fixturePaths = {
  regular: path.join(__dirname, 'fixtures/regular'),
  individually: path.join(__dirname, 'fixtures/individually'),
  artifact: path.join(__dirname, 'fixtures/artifact'),
};

describe('Integration test - Packaging', () => {
  let cwd;
  beforeEach(() => {
    cwd = getTmpDirPath();
  });

  it('package artifact directive works', () => {
    fse.copySync(fixturePaths.artifact, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    const cfnTemplate = JSON.parse(
      fs.readFileSync(path.join(cwd, '.serverless/cloudformation-template-update-stack.json'))
    );
    expect(cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key).to.match(
      /serverless\/aws-nodejs\/dev\/[^]*\/artifact.zip/
    );
    delete cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key;
    expect(cfnTemplate.Resources.HelloLambdaFunction).to.deep.equal({
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          S3Bucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
        },
        FunctionName: 'aws-nodejs-dev-hello',
        Handler: 'handler.hello',
        MemorySize: 1024,
        Role: {
          'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
        },
        Runtime: 'nodejs12.x',
        Timeout: 6,
      },
      DependsOn: ['HelloLogGroup', 'IamRoleLambdaExecution'],
    });
  });

  it('creates the correct default function resource in cfn template', () => {
    fse.copySync(fixturePaths.regular, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    const cfnTemplate = JSON.parse(
      fs.readFileSync(path.join(cwd, '.serverless/cloudformation-template-update-stack.json'))
    );
    expect(cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key).to.match(
      /serverless\/aws-nodejs\/dev\/[^]*\/aws-nodejs.zip/
    );
    delete cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key;
    expect(cfnTemplate.Resources.HelloLambdaFunction).to.deep.equal({
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          S3Bucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
        },
        FunctionName: 'aws-nodejs-dev-hello',
        Handler: 'handler.hello',
        MemorySize: 1024,
        Role: {
          'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
        },
        Runtime: 'nodejs12.x',
        Timeout: 6,
      },
      DependsOn: ['HelloLogGroup', 'IamRoleLambdaExecution'],
    });
  });

  it('handles package individually with include/excludes correctly', () => {
    fse.copySync(fixturePaths.individually, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    const cfnTemplate = JSON.parse(
      fs.readFileSync(path.join(cwd, '.serverless/cloudformation-template-update-stack.json'))
    );
    expect(cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key).to.match(
      /serverless\/aws-nodejs\/dev\/[^]*\/hello.zip/
    );
    expect(cfnTemplate.Resources.Hello2LambdaFunction.Properties.Code.S3Key).to.match(
      /serverless\/aws-nodejs\/dev\/[^]*\/hello2.zip/
    );
    delete cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key;
    expect(cfnTemplate.Resources.HelloLambdaFunction).to.deep.equal({
      Type: 'AWS::Lambda::Function',
      Properties: {
        Code: {
          S3Bucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
        },
        FunctionName: 'aws-nodejs-dev-hello',
        Handler: 'handler.hello',
        MemorySize: 1024,
        Role: {
          'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
        },
        Runtime: 'nodejs12.x',
        Timeout: 6,
      },
      DependsOn: ['HelloLogGroup', 'IamRoleLambdaExecution'],
    });
  });

  it('resolves self.provider.region', () => {
    fse.copySync(fixturePaths.regular, cwd);
    execSync(`${serverlessExec} package`, { cwd });
    const cfnTemplate = JSON.parse(
      fs.readFileSync(path.join(cwd, '.serverless/cloudformation-template-update-stack.json'))
    );
    expect(cfnTemplate.Resources.CustomDashnameLambdaFunction.Properties.FunctionName).to.equal(
      'aws-nodejs-us-east-1-custom-name'
    );
  });
});
