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
const {
  createApi,
  deleteApi,
  getRoutes,
  createStage,
  deleteStage,
} = require('../../utils/api-gateway-v2');

const CF = new AWS.CloudFormation({ region });

describe('AWS - API Gateway Websocket Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let serverlessFilePath;
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
  });

  after(() => {
    console.info('Removing service...');
    removeService(tmpDirPath);
  });

  describe('Minimal Setup', () => {
    it('should expose an accessible websocket endpoint', async () => {
      const result = await CF.describeStacks({ StackName: stackName }).promise();
      const endpointOutput = _.find(result.Stacks[0].Outputs, {
        OutputKey: 'ServiceEndpointWebsocket',
      }).OutputValue;
      expect(endpointOutput).to.match(/wss:\/\/.+\.execute-api\..+\.amazonaws\.com.+/);
    });

    // NOTE: this test should  be at the very end because we're using an external REST API here
    describe('when using an existing websocket API', () => {
      let websocketApiId;
      before(async () => {
        // create an external websocket API
        const externalWebsocketApiName = `${stage}-${serviceName}-ext-api`;
        const wsApiMeta = await createApi(externalWebsocketApiName);
        websocketApiId = wsApiMeta.ApiId;
        await createStage(websocketApiId, 'dev');
        const serverless = readYamlFile(serverlessFilePath);
        _.merge(serverless.provider, {
          apiGateway: {
            websocketApiId,
          },
        });
        writeYamlFile(serverlessFilePath, serverless);
        deployService(tmpDirPath);
      });

      after(async () => {
        // NOTE: deleting the references to the old, external websocket API
        const serverless = readYamlFile(serverlessFilePath);
        delete serverless.provider.apiGateway.websocketApiId;
        writeYamlFile(serverlessFilePath, serverless);
        // NOTE: we need to delete the stage before deleting the stack
        // otherwise CF will refuse to delete the deployment because a stage refers to that
        await deleteStage(websocketApiId, 'dev');
        // NOTE: deploying once again to get the stack into the original state
        console.info('Redeploying service...');
        deployService(tmpDirPath);
        console.info('Deleting external websocket API...');
        await deleteApi(websocketApiId);
      });

      it('should add the routes to the referenced API', async () => {
        const routes = await getRoutes(websocketApiId);
        expect(routes).to.have.length.greaterThan(0);
        expect(routes[0].RouteKey).to.equal('minimal');
      });
    });
  });
});
