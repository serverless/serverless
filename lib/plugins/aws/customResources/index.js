'use strict';

const path = require('path');
const BbPromise = require('bluebird');
const _ = require('lodash');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const childProcess = BbPromise.promisifyAll(require('child_process'));
const getTmpDirPath = require('../../../utils/fs/getTmpDirPath');
const createZipFile = require('../../../utils/fs/createZipFile');

function copyCustomResources(srcDirPath, destDirPath) {
  return fse.ensureDirAsync(destDirPath).then(() => fse.copyAsync(srcDirPath, destDirPath));
}

function installDependencies(dirPath) {
  return childProcess.execAsync(`npm install --prefix ${dirPath}`, { stdio: 'ignore' });
}

function addCustomResourceToService(resourceName, iamRoleStatements) {
  let FunctionName;
  let Handler;
  let customResourceFunctionLogicalId;

  const { Resources } = this.serverless.service.provider.compiledCloudFormationTemplate;
  const customResourcesRoleLogicalId = this.provider.naming.getCustomResourcesRoleLogicalId();
  const srcDirPath = path.join(__dirname, 'resources');
  const destDirPath = path.join(
    this.serverless.config.servicePath,
    '.serverless',
    this.provider.naming.getCustomResourcesArtifactDirectoryName()
  );
  const tmpDirPath = path.join(getTmpDirPath(), 'resources');
  const funcPrefix = `${this.serverless.service.service}-${this.options.stage}`;
  const zipFilePath = `${destDirPath}.zip`;
  this.serverless.utils.writeFileDir(zipFilePath);

  // check which custom resource should be used
  if (resourceName === 's3') {
    FunctionName = `${funcPrefix}-${this.provider.naming.getCustomResourceS3HandlerFunctionName()}`;
    Handler = 's3/handler.handler';
    customResourceFunctionLogicalId = this.provider.naming.getCustomResourceS3HandlerFunctionLogicalId();
  } else if (resourceName === 'cognitoUserPool') {
    FunctionName = `${funcPrefix}-${this.provider.naming.getCustomResourceCognitoUserPoolHandlerFunctionName()}`;
    Handler = 'cognitoUserPool/handler.handler';
    customResourceFunctionLogicalId = this.provider.naming.getCustomResourceCognitoUserPoolHandlerFunctionLogicalId();
  } else if (resourceName === 'eventBridge') {
    FunctionName = `${funcPrefix}-${this.provider.naming.getCustomResourceEventBridgeHandlerFunctionName()}`;
    Handler = 'eventBridge/handler.handler';
    customResourceFunctionLogicalId = this.provider.naming.getCustomResourceEventBridgeHandlerFunctionLogicalId();
  } else if (resourceName === 'apiGatewayCloudWatchRole') {
    FunctionName = `${funcPrefix}-${this.provider.naming.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionName()}`;
    Handler = 'apiGatewayCloudWatchRole/handler.handler';
    customResourceFunctionLogicalId = this.provider.naming.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId();
  } else {
    return BbPromise.reject(`No implementation found for Custom Resource "${resourceName}"`);
  }
  if (FunctionName.length > 64) {
    return BbPromise.reject(
      new Error(`Resolved custom resource function name '${FunctionName}' is too long`)
    );
  }

  // TODO: check every once in a while if external packages are still necessary
  this.serverless.cli.log('Installing dependencies for custom CloudFormation resources...');
  return copyCustomResources(srcDirPath, tmpDirPath)
    .then(() => installDependencies(tmpDirPath))
    .then(() => createZipFile(tmpDirPath, zipFilePath))
    .then(outputFilePath => {
      let S3Bucket = {
        Ref: this.provider.naming.getDeploymentBucketLogicalId(),
      };
      if (this.serverless.service.package.deploymentBucket) {
        S3Bucket = this.serverless.service.package.deploymentBucket;
      }
      const s3Folder = this.serverless.service.package.artifactDirectoryName;
      const s3FileName = outputFilePath.split(path.sep).pop();
      const S3Key = `${s3Folder}/${s3FileName}`;

      let customResourceRole = Resources[customResourcesRoleLogicalId];
      if (!customResourceRole) {
        customResourceRole = {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: ['lambda.amazonaws.com'],
                  },
                  Action: ['sts:AssumeRole'],
                },
              ],
            },
            Policies: [
              {
                PolicyName: {
                  'Fn::Join': [
                    '-',
                    [
                      this.provider.getStage(),
                      this.provider.serverless.service.service,
                      'custom-resources-lambda',
                    ],
                  ],
                },
                PolicyDocument: {
                  Version: '2012-10-17',
                  Statement: iamRoleStatements,
                },
              },
            ],
          },
        };
      } else {
        const { Statement } = customResourceRole.Properties.Policies[0].PolicyDocument;
        iamRoleStatements.forEach(newStmt => {
          if (!Statement.find(existingStmt => existingStmt.Resource === newStmt.Resource)) {
            Statement.push(newStmt);
          }
        });
      }

      const customResourceFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket,
            S3Key,
          },
          FunctionName,
          Handler,
          MemorySize: 1024,
          Role: {
            'Fn::GetAtt': [customResourcesRoleLogicalId, 'Arn'],
          },
          Runtime: 'nodejs10.x',
          Timeout: 6,
        },
        DependsOn: [customResourcesRoleLogicalId],
      };

      _.merge(Resources, {
        [customResourceFunctionLogicalId]: customResourceFunction,
        [customResourcesRoleLogicalId]: customResourceRole,
      });
    });
}

module.exports = {
  addCustomResourceToService,
};
