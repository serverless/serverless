'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../fixtures');

const { confirmCloudWatchLogs } = require('../utils/misc');
const {
  createEventBus,
  putEvents,
  deleteEventBus,
  describeEventBus,
} = require('../utils/eventBridge');

const { deployService, removeService, getMarkers } = require('../utils/integration');

describe('AWS - Event Bridge Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let stackName;
  let servicePath;
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
    const serviceData = await fixtures.setup('eventBridge');
    ({ servicePath } = serviceData);
    serviceName = serviceData.serviceConfig.service;

    namedEventBusName = `${serviceName}-named-event-bus`;
    arnEventBusName = `${serviceName}-arn-event-bus`;

    // get default event bus ARN
    const defaultEventBusArn = (await describeEventBus('default')).Arn;

    stackName = `${serviceName}-${stage}`;
    // create an external Event Bus
    // NOTE: deployment can only be done once the Event Bus is created
    arnEventBusArn = (await createEventBus(arnEventBusName)).EventBusArn;
    // update the YAML file with the arn
    await serviceData.updateConfig({
      functions: {
        eventBusDefaultArn: {
          events: [
            {
              eventBridge: {
                eventBus: defaultEventBusArn,
                pattern: { source: ['serverless.test'] },
              },
            },
          ],
        },
        eventBusArn: {
          events: [
            {
              eventBridge: {
                eventBus: arnEventBusArn,
                pattern: { source: ['serverless.test'] },
              },
            },
          ],
        },
      },
    });
    // deploy the service
    return deployService(servicePath);
  });

  after(async () => {
    log.notice('Removing service...');
    await removeService(servicePath);
    log.notice(`Deleting Event Bus "${arnEventBusName}"...`);
    return deleteEventBus(arnEventBusName);
  });

  describe('Default Event Bus', () => {
    it('should invoke function when an event is sent to the event bus', () => {
      const functionName = 'eventBusDefault';
      const markers = getMarkers(functionName);

      return confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => putEvents('default', putEventEntries),
        {
          checkIsComplete: events =>
            events.find(event => event.message.includes(markers.start)) &&
            events.find(event => event.message.includes(markers.end)),
        }
      ).then(events => {
        const logs = events.map(event => event.message).join('\n');
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

      return confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => putEvents(namedEventBusName, putEventEntries),
        {
          checkIsComplete: events =>
            events.find(event => event.message.includes(markers.start)) &&
            events.find(event => event.message.includes(markers.end)),
        }
      ).then(events => {
        const logs = events.map(event => event.message).join('\n');
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

      return confirmCloudWatchLogs(
        `/aws/lambda/${stackName}-${functionName}`,
        () => putEvents(arnEventBusName, putEventEntries),
        {
          checkIsComplete: events =>
            events.find(event => event.message.includes(markers.start)) &&
            events.find(event => event.message.includes(markers.end)),
        }
      ).then(events => {
        const logs = events.map(event => event.message).join('\n');
        expect(logs).to.include(`"source":"${eventSource}"`);
        expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
        expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
      });
    });
  });
});
