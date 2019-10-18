'use strict';

const path = require('path');
const AWS = require('aws-sdk');
const WebSocket = require('ws');
const _ = require('lodash');
const { expect } = require('chai');

const { getTmpDirPath, readYamlFile, writeYamlFile } = require('../../utils/fs');
const { region, confirmCloudWatchLogs, wait } = require('../../utils/misc');
const { createTestService, deployService, removeService } = require('../../utils/integration');
const {
  createApi,
  deleteApi,
  getRoutes,
  createStage,
  deleteStage,
} = require('../../utils/websocket');

const CF = new AWS.CloudFormation({ region });

describe('AWS - API Gateway Websocket Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let serverlessFilePath;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    console.info(`Deploying "${stackName}" service...`);
    return deployService(tmpDirPath);
  });

  after(() => {
    console.info('Removing service...');
    return removeService(tmpDirPath);
  });

  describe('Minimal Setup', () => {
    it('should expose an accessible websocket endpoint', async () => {
      const result = await CF.describeStacks({ StackName: stackName }).promise();
      const webSocketServerUrl = _.find(result.Stacks[0].Outputs, {
        OutputKey: 'ServiceEndpointWebsocket',
      }).OutputValue;
      console.info('WebSocket Server URL', webSocketServerUrl);
      expect(webSocketServerUrl).to.match(/wss:\/\/.+\.execute-api\..+\.amazonaws\.com.+/);
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(webSocketServerUrl);
        let isRejected = false;
        reject = (promiseReject => error => {
          isRejected = true;
          promiseReject(error);
          try {
            ws.close();
          } catch (closeError) {
            // safe to ignore
          }
        })(reject);
        ws.on('error', reject);
        ws.on('open', () => {
          confirmCloudWatchLogs(`/aws/websocket/${stackName}`, () => {
            if (isRejected) throw new Error('Stop propagation');
            ws.send('test message');
            return wait(500);
          }).then(events => {
            expect(events.length > 0).to.equal(true);
            ws.close();
          }, reject);
        });

        ws.on('close', resolve);

        ws.on('message', event => {
          console.info('Unexpected WebSocket message', event);
          reject(new Error('Unexpected message'));
        });
      });
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
        return deployService(tmpDirPath);
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
        await deployService(tmpDirPath);
        console.info('Deleting external websocket API...');
        await deleteApi(websocketApiId);
      });

      it('should add the routes to the referenced API', async () => {
        const routes = await getRoutes(websocketApiId);
        expect(routes.length).to.equal(3);
      });
    });
  });
});
