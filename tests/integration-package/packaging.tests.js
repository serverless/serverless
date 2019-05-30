'use strict';

const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const { execSync } = require('child_process');
const { serverlessExec } = require('../utils/misc');
const { getTmpDirPath, listZipFiles } = require('../utils/fs');

describe('Integration test - Packaging', () => {
  let cwd;
  beforeEach(() => {
    cwd = getTmpDirPath();
    fse.mkdirsSync(cwd);
  });

  it('packages the default aws template correctly in the zip', () => {
    fse.copySync(path.join(__dirname, 'serverless.yml'), path.join(cwd, 'serverless.yml'));
    fse.copySync(path.join(__dirname, 'handler.js'), path.join(cwd, 'handler.js'));
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        expect(zipfiles).toEqual(['handler.js']);
      });
  });

  it('packages the default aws template with an npm dep correctly in the zip', () => {
    fse.copySync(path.join(__dirname, 'serverless.yml'), path.join(cwd, 'serverless.yml'));
    fse.copySync(path.join(__dirname, 'handler.js'), path.join(cwd, 'handler.js'));
    execSync('npm init --yes', { cwd });
    execSync('npm i lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        const nodeModules = new Set(
          zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1]));
        const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
        expect(nodeModules).toEqual(new Set(['lodash']));
        expect(nonNodeModulesFiles).toEqual(['handler.js', 'package-lock.json', 'package.json']);
      });
  });

  it('doesn\'t package a dev dependency in the zip', () => {
    fse.copySync(path.join(__dirname, 'serverless.yml'), path.join(cwd, 'serverless.yml'));
    fse.copySync(path.join(__dirname, 'handler.js'), path.join(cwd, 'handler.js'));
    execSync('npm init --yes', { cwd });
    execSync('npm i --save-dev lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        const nodeModules = new Set(
          zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1]));
        const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
        expect(nodeModules).toEqual(new Set([]));
        expect(nonNodeModulesFiles).toEqual(['handler.js', 'package-lock.json', 'package.json']);
      });
  });

  it('ignores package json files per ignore directive in the zip', () => {
    fse.copySync(path.join(__dirname, 'serverless.yml'), path.join(cwd, 'serverless.yml'));
    fse.copySync(path.join(__dirname, 'handler.js'), path.join(cwd, 'handler.js'));
    execSync('npm init --yes', { cwd });
    execSync('echo \'package: {exclude: ["package*.json"]}\' >> serverless.yml', { cwd });
    execSync('npm i lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        const nodeModules = new Set(
          zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1]));
        const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
        expect(nodeModules).toEqual(new Set(['lodash']));
        expect(nonNodeModulesFiles).toEqual(['handler.js']);
      });
  });

  it('package artifact directive works', () => {
    fse.copySync(path.join(__dirname, 'serverless.yml'), path.join(cwd, 'serverless.yml'));
    fse.copySync(path.join(__dirname, 'artifact.zip'), path.join(cwd, 'artifact.zip'));
    execSync('echo \'package: {artifact: artifact.zip}\' >> serverless.yml', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    const cfnTemplate = JSON.parse(fs.readFileSync(path.join(
      cwd, '.serverless/cloudformation-template-update-stack.json')));
    expect(cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key)
      .toMatch(/serverless\/aws-nodejs\/dev\/[^]*\/artifact.zip/);
    delete cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key;
    expect(cfnTemplate.Resources.HelloLambdaFunction).toEqual({
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
          'Fn::GetAtt': [
            'IamRoleLambdaExecution',
            'Arn',
          ],
        },
        Runtime: 'nodejs10.x',
        Timeout: 6,
      },
      DependsOn: [
        'HelloLogGroup',
        'IamRoleLambdaExecution',
      ],
    });
  });

  it('creates the correct default function resource in cfn template', () => {
    fse.copySync(path.join(__dirname, 'serverless.yml'), path.join(cwd, 'serverless.yml'));
    fse.copySync(path.join(__dirname, 'handler.js'), path.join(cwd, 'handler.js'));
    execSync(`${serverlessExec} package`, { cwd });
    const cfnTemplate = JSON.parse(fs.readFileSync(path.join(
      cwd, '.serverless/cloudformation-template-update-stack.json')));
    expect(cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key)
      .toMatch(/serverless\/aws-nodejs\/dev\/[^]*\/aws-nodejs.zip/);
    delete cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key;
    expect(cfnTemplate.Resources.HelloLambdaFunction).toEqual({
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
          'Fn::GetAtt': [
            'IamRoleLambdaExecution',
            'Arn',
          ],
        },
        Runtime: 'nodejs10.x',
        Timeout: 6,
      },
      DependsOn: [
        'HelloLogGroup',
        'IamRoleLambdaExecution',
      ],
    });
    return listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        expect(zipfiles).toEqual(['handler.js']);
      });
  });

  it('handles package individually with include/excludes correctly', () => {
    fse.copySync(path.join(__dirname, 'individually.yml'), path.join(cwd, 'serverless.yml'));
    fse.copySync(path.join(__dirname, 'handler.js'), path.join(cwd, 'handler.js'));
    fse.copySync(path.join(__dirname, 'handler.js'), path.join(cwd, 'handler2.js'));
    execSync(`${serverlessExec} package`, { cwd });
    const cfnTemplate = JSON.parse(fs.readFileSync(path.join(
      cwd, '.serverless/cloudformation-template-update-stack.json')));
    expect(cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key)
      .toMatch(/serverless\/aws-nodejs\/dev\/[^]*\/hello.zip/);
    expect(cfnTemplate.Resources.Hello2LambdaFunction.Properties.Code.S3Key)
      .toMatch(/serverless\/aws-nodejs\/dev\/[^]*\/hello2.zip/);
    delete cfnTemplate.Resources.HelloLambdaFunction.Properties.Code.S3Key;
    expect(cfnTemplate.Resources.HelloLambdaFunction).toEqual({
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
          'Fn::GetAtt': [
            'IamRoleLambdaExecution',
            'Arn',
          ],
        },
        Runtime: 'nodejs10.x',
        Timeout: 6,
      },
      DependsOn: [
        'HelloLogGroup',
        'IamRoleLambdaExecution',
      ],
    });
    return listZipFiles(path.join(cwd, '.serverless/hello.zip'))
      .then(zipfiles => expect(zipfiles).toEqual(['handler.js']))
      .then(() => listZipFiles(path.join(cwd, '.serverless/hello2.zip')))
      .then(zipfiles => expect(zipfiles).toEqual(['handler2.js']));
  });
});
