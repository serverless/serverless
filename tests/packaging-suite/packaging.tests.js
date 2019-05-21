'use strict';

const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;
const fse = require('fs-extra');
const testUtils = require('../utils/index');

const serverlessExec = path.join(__dirname, '..', '..', 'bin', 'serverless');

describe('Integration test - Packaging', () => {
  let cwd;
  beforeEach(() => {
    cwd = testUtils.getTmpDirPath();
    fse.mkdirsSync(cwd);
  });

  it('packages the default aws template correctly in the zip', () => {
    const templateName = 'aws-nodejs';
    execSync(`${serverlessExec} create --template ${templateName}`, { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return testUtils.listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        expect(zipfiles).toEqual(['handler.js']);
      });
  });

  it('packages the default aws template with an npm dep correctly in the zip', () => {
    const templateName = 'aws-nodejs';
    execSync(`${serverlessExec} create --template ${templateName}`, { cwd });
    execSync('npm init --yes', { cwd });
    execSync('npm i lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return testUtils.listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        const nodeModules = new Set(
          zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1]));
        const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
        expect(nodeModules).toEqual(new Set(['lodash']));
        expect(nonNodeModulesFiles).toEqual(['handler.js', 'package-lock.json', 'package.json']);
      });
  });

  it('doesn\'t package a dev dependency in the zip', () => {
    const templateName = 'aws-nodejs';
    execSync(`${serverlessExec} create --template ${templateName}`, { cwd });
    execSync('npm init --yes', { cwd });
    execSync('npm i --save-dev lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return testUtils.listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        const nodeModules = new Set(
          zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1]));
        const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
        expect(nodeModules).toEqual(new Set([]));
        expect(nonNodeModulesFiles).toEqual(['handler.js', 'package-lock.json', 'package.json']);
      });
  });

  it('ignores package json files per ignore directive in the zip', () => {
    const templateName = 'aws-nodejs';
    execSync(`${serverlessExec} create --template ${templateName}`, { cwd });
    execSync('npm init --yes', { cwd });
    execSync('echo \'package: {exclude: ["package*.json"]}\' >> serverless.yml', { cwd });
    execSync('npm i lodash', { cwd });
    execSync(`${serverlessExec} package`, { cwd });
    return testUtils.listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        const nodeModules = new Set(
          zipfiles.filter(f => f.startsWith('node_modules')).map(f => f.split(path.sep)[1]));
        const nonNodeModulesFiles = zipfiles.filter(f => !f.startsWith('node_modules'));
        expect(nodeModules).toEqual(new Set(['lodash']));
        expect(nonNodeModulesFiles).toEqual(['handler.js']);
      });
  });
});

describe('Integration test - Packaging', () => {
  let cwd;
  beforeEach(() => {
    cwd = testUtils.getTmpDirPath();
    fse.mkdirsSync(cwd);
  });

  it('creates the correct default function resource in cfn template', () => {
    const templateName = 'aws-nodejs';
    execSync(`${serverlessExec} create --template ${templateName}`, { cwd });
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
    return testUtils.listZipFiles(path.join(cwd, '.serverless/aws-nodejs.zip'))
      .then(zipfiles => {
        expect(zipfiles).toEqual(['handler.js']);
      });
  });
});
