'use strict';

const path = require('path');
const AWS = require('aws-sdk');
const _ = require('lodash');
const { expect } = require('chai');

const { getTmpDirPath, readYamlFile, writeYamlFile } = require('../../utils/fs');
const {
  region,
  // confirmCloudWatchLogs,
  createTestService,
  deployService,
  removeService,
} = require('../../utils/misc');
const { createApi, deleteApi, getRoutes, createStage, deleteStage } = require('../../utils/api-gateway-v2');

const CF = new AWS.CloudFormation({ region });

describe('AWS - API Gateway Websocket Integration Test', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let serverlessFilePath;
  let websocketApiId;
  const stage = 'dev';

  before(() => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');
    const serverlessConfig = createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    console.info(`Deploying "${stackName}" service...`);
    deployService(tmpDirPath);
    // create an external websocket API
    const externalWebsocketApiName = `${stage}-${serviceName}-ext-api`;
    return createApi(externalWebsocketApiName)
      .then(wsApiMeta => {
        websocketApiId = wsApiMeta.ApiId;
        return createStage(websocketApiId, 'dev');
      });
  });

  after(() => {
    // NOTE: deleting the references to the old, external websocket API
    const serverless = readYamlFile(serverlessFilePath);
    delete serverless.provider.apiGateway.websocketApiId;
    writeYamlFile(serverlessFilePath, serverless);
    // NOTE: we need to delete the stage before deleting the stack
    // otherwise CF will refuse to delete the deployment because a stage refers to that
    return deleteStage(websocketApiId, 'dev').then(() => {
      // NOTE: deploying once again to get the stack into the original state
      console.info('Redeploying service...');
      deployService(tmpDirPath);
      console.info('Removing service...');
      removeService(tmpDirPath);
      console.info('Deleting external rest API...');
      return deleteApi(websocketApiId);
    });
  });

  describe('Minimal Setup', () => {

    it('should expose an accessible websocket endpoint', () => CF.describeStacks({ StackName: stackName })
      .promise()
      .then(result => _.find(result.Stacks[0].Outputs, { OutputKey: 'ServiceEndpointWebsocket' }).OutputValue)
      .then(endpointOutput => {
        expect(endpointOutput).to.match(/wss:\/\/.+\.execute-api\..+\.amazonaws\.com.+/);
      }));

    // NOTE: this test should  be at the very end because we're using an external REST API here
    describe('when using an existing websocket API', () => {
      before(() => {
        const serverless = readYamlFile(serverlessFilePath);
        _.merge(serverless.provider, {
          apiGateway: {
            websocketApiId,
          },

        });
        writeYamlFile(serverlessFilePath, serverless);
        deployService(tmpDirPath);
      });

      it('should add the routes to the referenced API', () => getRoutes(websocketApiId)
        .then(routes => {
          expect(routes).to.have.length.greaterThan(0);
          expect(routes[0].RouteKey).to.equal('minimal');
        }));
    });
  });
});