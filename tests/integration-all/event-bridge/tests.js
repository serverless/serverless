'use strict';

const path = require('path');
const { expect } = require('chai');

const { getTmpDirPath, readYamlFile, writeYamlFile } = require('../../utils/fs');
const { createEventBus, putEvents, deleteEventBus } = require('../../utils/eventBridge');

const {
  createTestService,
  deployService,
  removeService,
  waitForFunctionLogs,
} = require('../../utils/integration');
const { getMarkers } = require('../shared/utils');

describe('AWS - Event Bridge Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let tmpDirPath;
  let namedEventBusName;
  let arnEventBusName;
  let arnEventBusArn;
  const eventSource = 'serverless.test';
  const stage = 'dev';
  const putEventEntries = [
    {
      Source: eventSource,
      DetailType: 'ServerlessDetailType',
      Detail: '{"Key1":"Value1"}',
    },
  ];

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      filesToAdd: [path.join(__dirname, '..', 'shared')],
      serverlessConfigHook:
        // Ensure unique event bus names for each test (to avoid collision among concurrent CI runs)
        config => {
          namedEventBusName = `${config.service}-named-event-bus`;
          arnEventBusName = `${config.service}-arn-event-bus`;
          config.functions.eventBusCustom.events[0].eventBridge.eventBus = namedEventBusName;
        },
    });

    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    // create an external Event Bus
    // NOTE: deployment can only be done once the Event Bus is created
    console.info(`Creating Event Bus "${arnEventBusName}"...`);
    return createEventBus(arnEventBusName).then(data => {
      arnEventBusArn = data.EventBusArn;
      // update the YAML file with the arn
      console.info(`Updating serverless.yml with Event Bus arn "${arnEventBusArn}"`);
      const serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');
      const config = readYamlFile(serverlessFilePath);
      config.functions.eventBusArn.events[0].eventBridge.eventBus = arnEventBusArn;
      writeYamlFile(serverlessFilePath, config);
      // deploy the service
      console.info(`Deploying "${stackName}" service...`);
      return deployService(tmpDirPath);
    });
  });

  after(async () => {
    console.info('Removing service...');
    await removeService(tmpDirPath);
    console.info(`Deleting Event Bus "${arnEventBusName}"...`);
    return deleteEventBus(arnEventBusName);
  });

  describe('Default Event Bus', () => {
    it('should invoke function when an event is sent to the event bus', () => {
      const functionName = 'eventBusDefault';
      const markers = getMarkers(functionName);

      return putEvents('default', putEventEntries)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(`"source":"${eventSource}"`);
          expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
          expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
        });
    });
  });

  describe('Custom Event Bus', () => {
    it('should invoke function when an event is sent to the event bus', () => {
      const functionName = 'eventBusCustom';
      const markers = getMarkers(functionName);

      return putEvents(namedEventBusName, putEventEntries)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(`"source":"${eventSource}"`);
          expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
          expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
        });
    });
  });

  describe('Arn Event Bus', () => {
    it('should invoke function when an event is sent to the event bus', () => {
      const functionName = 'eventBusArn';
      const markers = getMarkers(functionName);

      return putEvents(arnEventBusName, putEventEntries)
        .then(() => waitForFunctionLogs(tmpDirPath, functionName, markers.start, markers.end))
        .then(logs => {
          expect(logs).to.include(`"source":"${eventSource}"`);
          expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
          expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
        });
    });
  });
});
