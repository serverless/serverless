'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const fixtures = require('../../fixtures/programmatic');

const { confirmCloudWatchLogs } = require('../../utils/misc');
const {
  createEventBus,
  putEvents,
  deleteEventBus,
  describeEventBus,
} = require('../../utils/eventBridge');

const { deployService, removeService, getMarkers } = require('../../utils/integration');

describe('AWS - Event Bridge Integration Test', () => {
  describe('Using deprecated CustomResource deployment pattern', function () {
    this.timeout(1000 * 60 * 100); // Involves time-taking deploys
    let serviceName;
    let stackName;
    let serviceDir;
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
      ({ servicePath: serviceDir } = serviceData);
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
        disabledDeprecations: ['AWS_EVENT_BRIDGE_CUSTOM_RESOURCE_LEGACY_OPT_IN'],
        provider: {
          eventBridge: {
            useCloudFormation: false,
          },
        },
        functions: {
          eventBusDefaultArn: {
            events: [
              {
                eventBridge: {
                  eventBus: defaultEventBusArn,
                  pattern: { source: [eventSource] },
                },
              },
            ],
          },
          eventBusArn: {
            events: [
              {
                eventBridge: {
                  eventBus: arnEventBusArn,
                  pattern: { source: [eventSource] },
                },
              },
            ],
          },
        },
      });
      // deploy the service
      return deployService(serviceDir);
    });

    after(async () => {
      log.notice('Removing service...');
      await removeService(serviceDir);
      log.notice(`Deleting Event Bus "${arnEventBusName}"...`);
      return deleteEventBus(arnEventBusName);
    });

    describe('Default Event Bus', () => {
      it('should invoke function when an event is sent to the event bus', async () => {
        const functionName = 'eventBusDefault';
        const markers = getMarkers(functionName);

        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          () => putEvents('default', putEventEntries),
          {
            checkIsComplete: (data) =>
              data.find((event) => event.message.includes(markers.start)) &&
              data.find((event) => event.message.includes(markers.end)),
          }
        );
        const logs = events.map((event) => event.message).join('\n');
        expect(logs).to.include(`"source":"${eventSource}"`);
        expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
        expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
      });
    });

    describe('Custom Event Bus', () => {
      it('should invoke function when an event is sent to the event bus', async () => {
        const functionName = 'eventBusCustom';
        const markers = getMarkers(functionName);

        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          () => putEvents(namedEventBusName, putEventEntries),
          {
            checkIsComplete: (data) =>
              data.find((event) => event.message.includes(markers.start)) &&
              data.find((event) => event.message.includes(markers.end)),
          }
        );
        const logs = events.map((event) => event.message).join('\n');
        expect(logs).to.include(`"source":"${eventSource}"`);
        expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
        expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
      });
    });

    describe('Arn Event Bus', () => {
      it('should invoke function when an event is sent to the event bus', async () => {
        const functionName = 'eventBusArn';
        const markers = getMarkers(functionName);

        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          () => putEvents(arnEventBusName, putEventEntries),
          {
            checkIsComplete: (data) =>
              data.find((event) => event.message.includes(markers.start)) &&
              data.find((event) => event.message.includes(markers.end)),
          }
        );
        const logs = events.map((event) => event.message).join('\n');
        expect(logs).to.include(`"source":"${eventSource}"`);
        expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
        expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
      });
    });
  });

  describe('Using native CloudFormation deployment pattern', function () {
    this.timeout(1000 * 60 * 10); // Involves time-taking deploys
    let serviceName;
    let stackName;
    let serviceDir;
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
      ({ servicePath: serviceDir } = serviceData);
      serviceName = serviceData.serviceConfig.service;

      namedEventBusName = `${serviceName}-named-event-bus`;
      arnEventBusName = `${serviceName}-arn-event-bus`;

      // get default event bus ARN
      const defaultEventBusArn = (await describeEventBus('default')).Arn;

      stackName = `${serviceName}-${stage}`;
      // create an external Event Bus
      // NOTE: deployment can only be done once the Event Bus is created
      arnEventBusArn = (await createEventBus(arnEventBusName)).EventBusArn;
      await serviceData.updateConfig({
        functions: {
          eventBusDefaultArn: {
            events: [
              {
                eventBridge: {
                  eventBus: defaultEventBusArn,
                  pattern: { source: [eventSource] },
                },
              },
            ],
          },
          eventBusArn: {
            events: [
              {
                eventBridge: {
                  eventBus: arnEventBusArn,
                  pattern: { source: [eventSource] },
                },
              },
            ],
          },
        },
      });
      return deployService(serviceDir);
    });

    after(async () => {
      log.notice('Removing service...');
      await removeService(serviceDir);
      log.notice(`Deleting Event Bus "${arnEventBusName}"...`);
      return deleteEventBus(arnEventBusName);
    });

    describe('Default Event Bus', () => {
      it('should invoke function when an event is sent to the event bus', async () => {
        const functionName = 'eventBusDefault';
        const markers = getMarkers(functionName);

        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          () => putEvents('default', putEventEntries),
          {
            checkIsComplete: (data) =>
              data.find((event) => event.message.includes(markers.start)) &&
              data.find((event) => event.message.includes(markers.end)),
          }
        );
        const logs = events.map((event) => event.message).join('\n');
        expect(logs).to.include(`"source":"${eventSource}"`);
        expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
        expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
      });
    });

    describe('Custom Event Bus', () => {
      it('should invoke function when an event is sent to the event bus', async () => {
        const functionName = 'eventBusCustom';
        const markers = getMarkers(functionName);

        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          () => putEvents(namedEventBusName, putEventEntries),
          {
            checkIsComplete: (data) =>
              data.find((event) => event.message.includes(markers.start)) &&
              data.find((event) => event.message.includes(markers.end)),
          }
        );
        const logs = events.map((event) => event.message).join('\n');
        expect(logs).to.include(`"source":"${eventSource}"`);
        expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
        expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
      });
    });

    describe('Arn Event Bus', () => {
      it('should invoke function when an event is sent to the event bus', async () => {
        const functionName = 'eventBusArn';
        const markers = getMarkers(functionName);

        const events = await confirmCloudWatchLogs(
          `/aws/lambda/${stackName}-${functionName}`,
          () => putEvents(arnEventBusName, putEventEntries),
          {
            checkIsComplete: (data) =>
              data.find((event) => event.message.includes(markers.start)) &&
              data.find((event) => event.message.includes(markers.end)),
          }
        );

        const logs = events.map((event) => event.message).join('\n');
        expect(logs).to.include(`"source":"${eventSource}"`);
        expect(logs).to.include(`"detail-type":"${putEventEntries[0].DetailType}"`);
        expect(logs).to.include(`"detail":${putEventEntries[0].Detail}`);
      });
    });
  });
});
