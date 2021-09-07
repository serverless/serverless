'use strict';

const runServerless = require('../../../../../../../utils/run-serverless');
const ServerlessError = require('../../../../../../../../lib/serverless-error');
const { use: chaiUse, expect } = require('chai');
const chaiAsPromised = require('chai-as-promised');

chaiUse(chaiAsPromised);

async function run(events) {
  const params = {
    fixture: 'function',
    command: 'package',
    configExt: {
      functions: {
        test: {
          handler: 'index.handler',
          events,
        },
      },
    },
  };
  const { awsNaming, cfTemplate } = await runServerless(params);
  const cfResources = cfTemplate.Resources;

  const scheduleCfResources = [];

  for (const event of events) {
    const schedule = event.schedule;
    let scheduleEvents;

    if (typeof schedule === 'string') {
      scheduleEvents = [schedule];
    } else {
      scheduleEvents = Array.isArray(schedule.rate) ? schedule.rate : [schedule.rate];
    }

    for (let i = 0; i < scheduleEvents.length; i++) {
      const index = scheduleCfResources.length + 1;

      const scheduleLogicalId = awsNaming.getScheduleLogicalId('test', index);
      const scheduleCfResource = cfResources[scheduleLogicalId];

      scheduleCfResources.push(scheduleCfResource);
    }
  }

  return scheduleCfResources;
}

describe('ScheduleEvents', () => {
  it('should create corresponding resources when schedule events are given', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
        },
      },
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: true,
        },
      },
      {
        schedule: 'rate(10 minutes)',
      },
      {
        schedule: 'cron(5,35 12 ? * 6l 2002-2005)',
      },
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
        },
      },
    ];

    const scheduleCfResources = await run(events);

    for (let i = 0; i < events.length; i += 1) {
      expect(scheduleCfResources[i].Type).to.equal('AWS::Events::Rule');
    }
  });

  it('should respect enabled variable, defaulting to true', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
        },
      },
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: true,
        },
      },
      {
        schedule: {
          rate: 'rate(10 minutes)',
        },
      },
      {
        schedule: 'rate(10 minutes)',
      },
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
          enabled: false,
        },
      },
    ];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources[0].Properties.State).to.equal('DISABLED');
    expect(scheduleCfResources[1].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[2].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[3].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[4].Properties.State).to.equal('DISABLED');
    expect(scheduleCfResources[5].Properties.State).to.equal('DISABLED');
  });

  it('should respect name variable', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
          name: 'your-scheduled-event-name',
        },
      },
      {
        schedule: {
          rate: ['rate(1 hour)'],
          enabled: false,
          name: 'your-scheduled-event-name-array',
        },
      },
    ];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources[0].Properties.Name).to.equal('your-scheduled-event-name');
    expect(scheduleCfResources[1].Properties.Name).to.equal('your-scheduled-event-name-array');
  });

  it('should throw an error if a name is specified when defining more than one rate expression', async () => {
    const events = [
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
          enabled: false,
          name: 'your-scheduled-event-name',
        },
      },
    ];

    await expect(run(events)).to.be.eventually.rejectedWith(
      ServerlessError,
      'You cannot specify a name when defining more than one rate expression'
    );
  });

  it('should respect description variable', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
          description: 'your scheduled event description',
        },
      },
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
          description: 'your scheduled event description (array)',
        },
      },
    ];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources[0].Properties.Description).to.equal(
      'your scheduled event description'
    );
    expect(scheduleCfResources[1].Properties.Description).to.equal(
      'your scheduled event description (array)'
    );
    expect(scheduleCfResources[2].Properties.Description).to.equal(
      'your scheduled event description (array)'
    );
  });

  it('should respect inputPath variable', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
          inputPath: '$.stageVariables',
        },
      },
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
          inputPath: '$.stageVariables',
        },
      },
    ];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources[0].Properties.Targets[0].InputPath).to.equal('$.stageVariables');
    expect(scheduleCfResources[1].Properties.Targets[0].InputPath).to.equal('$.stageVariables');
    expect(scheduleCfResources[2].Properties.Targets[0].InputPath).to.equal('$.stageVariables');
  });

  it('should respect input variable', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
          input: '{"key":"value"}',
        },
      },
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
          input: '{"key":"array"}',
        },
      },
    ];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources[0].Properties.Targets[0].Input).to.equal('{"key":"value"}');
    expect(scheduleCfResources[1].Properties.Targets[0].Input).to.equal('{"key":"array"}');
    expect(scheduleCfResources[2].Properties.Targets[0].Input).to.equal('{"key":"array"}');
  });

  it('should respect input variable as an object', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
          input: {
            key: 'value',
          },
        },
      },
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
          input: {
            key: 'array',
          },
        },
      },
    ];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources[0].Properties.Targets[0].Input).to.equal('{"key":"value"}');
    expect(scheduleCfResources[1].Properties.Targets[0].Input).to.equal('{"key":"array"}');
    expect(scheduleCfResources[2].Properties.Targets[0].Input).to.equal('{"key":"array"}');
  });

  it('should respect inputTransformer variable', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
          inputTransformer: {
            inputPathsMap: {
              eventTime: '$.time',
            },
            inputTemplate: '{"time": <eventTime>, "key": "value"}',
          },
        },
      },
      {
        schedule: {
          rate: ['cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'],
          inputTransformer: {
            inputPathsMap: {
              eventTime: '$.time',
            },
            inputTemplate: '{"time": <eventTime>, "key": "array"}',
          },
        },
      },
    ];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources[0].Properties.Targets[0].InputTransformer).to.deep.equal({
      InputTemplate: '{"time": <eventTime>, "key": "value"}',
      InputPathsMap: { eventTime: '$.time' },
    });
    expect(scheduleCfResources[1].Properties.Targets[0].InputTransformer).to.deep.equal({
      InputTemplate: '{"time": <eventTime>, "key": "array"}',
      InputPathsMap: { eventTime: '$.time' },
    });
    expect(scheduleCfResources[2].Properties.Targets[0].InputTransformer).to.deep.equal({
      InputTemplate: '{"time": <eventTime>, "key": "array"}',
      InputPathsMap: { eventTime: '$.time' },
    });
  });

  it('should not create corresponding resources when scheduled events are not given', async () => {
    const events = [];

    const scheduleCfResources = await run(events);

    expect(scheduleCfResources).to.be.empty;
  });
});
