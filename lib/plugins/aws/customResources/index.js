'use strict';

const path = require('path');
const crypto = require('crypto');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const childProcess = BbPromise.promisifyAll(require('child_process'));
const getTmpDirPath = require('../../../utils/fs/getTmpDirPath');
const createZipFile = require('../../../utils/fs/createZipFile');

function copyCustomResources(srcDirPath, destDirPath) {
  return fse.ensureDirAsync(destDirPath).then(() => fse.copyAsync(srcDirPath, destDirPath));
}

function installDependencies(dirPath) {
  return childProcess.execAsync('npm install', { cwd: dirPath });
}

function addCustomResourceToService(awsProvider, resourceName, iamRoleStatements) {
  let functionName;
  let absoluteFunctionName;
  let Handler;
  let customResourceFunctionLogicalId;

  const { serverless } = awsProvider;
  const { cliOptions } = serverless.pluginManager;
  const providerConfig = serverless.service.provider;
  const shouldWriteLogs = providerConfig.logs && providerConfig.logs.frameworkLambda;
  const { Resources } = providerConfig.compiledCloudFormationTemplate;
  const customResourcesRoleLogicalId = awsProvider.naming.getCustomResourcesRoleLogicalId();
  const srcDirPath = path.join(__dirname, 'resources');
  const destDirPath = path.join(
    serverless.config.servicePath,
    '.serverless',
    awsProvider.naming.getCustomResourcesArtifactDirectoryName()
  );
  const tmpDirPath = path.join(getTmpDirPath(), 'resources');
  const funcPrefix = `${serverless.service.service}-${cliOptions.stage}`;
  const zipFilePath = `${destDirPath}.zip`;
  serverless.utils.writeFileDir(zipFilePath);

  // check which custom resource should be used
  if (resourceName === 's3') {
    functionName = awsProvider.naming.getCustomResourceS3HandlerFunctionName();
    Handler = 's3/handler.handler';
    customResourceFunctionLogicalId = awsProvider.naming.getCustomResourceS3HandlerFunctionLogicalId();
  } else if (resourceName === 'cognitoUserPool') {
    functionName = awsProvider.naming.getCustomResourceCognitoUserPoolHandlerFunctionName();
    Handler = 'cognitoUserPool/handler.handler';
    customResourceFunctionLogicalId = awsProvider.naming.getCustomResourceCognitoUserPoolHandlerFunctionLogicalId();
  } else if (resourceName === 'eventBridge') {
    functionName = awsProvider.naming.getCustomResourceEventBridgeHandlerFunctionName();
    Handler = 'eventBridge/handler.handler';
    customResourceFunctionLogicalId = awsProvider.naming.getCustomResourceEventBridgeHandlerFunctionLogicalId();
  } else if (resourceName === 'apiGatewayCloudWatchRole') {
    functionName = awsProvider.naming.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionName();
    Handler = 'apiGatewayCloudWatchRole/handler.handler';
    customResourceFunctionLogicalId = awsProvider.naming.getCustomResourceApiGatewayAccountCloudWatchRoleHandlerFunctionLogicalId();
  } else {
    return BbPromise.reject(`No implementation found for Custom Resource "${resourceName}"`);
  }
  absoluteFunctionName = `${funcPrefix}-${functionName}`;
  if (absoluteFunctionName.length > 64) {
    // Function names cannot be longer than 64.
    // Temporary solution until we have https://github.com/serverless/serverless/issues/6598
    // (which doesn't change names of already deployed functions)
    absoluteFunctionName = `${absoluteFunctionName.slice(0, 32)}${crypto
      .createHash('md5')
      .update(absoluteFunctionName)
      .digest('hex')}`;
  }

  // TODO: check every once in a while if external packages are still necessary
  serverless.cli.log('Installing dependencies for custom CloudFormation resources...');
  return copyCustomResources(srcDirPath, tmpDirPath)
    .then(() => installDependencies(tmpDirPath))
    .then(() => createZipFile(tmpDirPath, zipFilePath))
    .then(outputFilePath => {
      let S3Bucket = {
        Ref: awsProvider.naming.getDeploymentBucketLogicalId(),
      };
      if (serverless.service.package.deploymentBucket) {
        S3Bucket = serverless.service.package.deploymentBucket;
      }
      const s3Folder = serverless.service.package.artifactDirectoryName;
      const s3FileName = outputFilePath.split(path.sep).pop();
      const S3Key = `${s3Folder}/${s3FileName}`;

      const cfnRoleArn = serverless.service.provider.cfnRole;

      if (!cfnRoleArn) {
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
                        awsProvider.getStage(),
                        awsProvider.serverless.service.service,
                        'custom-resources-lambda',
                      ],
                    ],
                  },
                  PolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [],
                  },
                },
              ],
            },
          };
          Resources[customResourcesRoleLogicalId] = customResourceRole;

          if (shouldWriteLogs) {
            const logGroupsPrefix = awsProvider.naming.getLogGroupName(funcPrefix);
            customResourceRole.Properties.Policies[0].PolicyDocument.Statement.push(
              {
                Effect: 'Allow',
                Action: ['logs:CreateLogStream'],
                Resource: [
                  {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
                      `:log-group:${logGroupsPrefix}*:*`,
                  },
                ],
              },
              {
                Effect: 'Allow',
                Action: ['logs:PutLogEvents'],
                Resource: [
                  {
                    'Fn::Sub':
                      'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
                      `:log-group:${logGroupsPrefix}*:*:*`,
                  },
                ],
              }
            );
          }
        }
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
          FunctionName: absoluteFunctionName,
          Handler,
          MemorySize: 1024,
          Runtime: 'nodejs10.x',
          Timeout: 180,
        },
        DependsOn: [],
      };
      Resources[customResourceFunctionLogicalId] = customResourceFunction;

      if (cfnRoleArn) {
        customResourceFunction.Properties.Role = cfnRoleArn;
      } else {
        customResourceFunction.Properties.Role = {
          'Fn::GetAtt': [customResourcesRoleLogicalId, 'Arn'],
        };
        customResourceFunction.DependsOn.push(customResourcesRoleLogicalId);
      }

      if (shouldWriteLogs) {
        const customResourceLogGroupLogicalId = awsProvider.naming.getLogGroupLogicalId(
          functionName
        );
        customResourceFunction.DependsOn.push(customResourceLogGroupLogicalId);
        Object.assign(Resources, {
          [customResourceLogGroupLogicalId]: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
              LogGroupName: awsProvider.naming.getLogGroupName(absoluteFunctionName),
            },
          },
        });
      }
    });
}

module.exports = {
  addCustomResourceToService,
};
