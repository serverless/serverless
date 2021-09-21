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

describe('test/unit/lib/plugins/aws/package/compile/events/schedule.test.js', () => {
  let scheduleCfResources;

  before(async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: false,
          name: 'your-scheduled-event-name',
          description: 'your scheduled event description',
        },
      },
      {
        schedule: {
          rate: ['rate(1 hour)'],
          name: 'your-scheduled-event-name-array',
          inputPath: '$.stageVariables',
        },
      },
      {
        schedule: {
          rate: 'rate(10 minutes)',
          enabled: true,
          input: '{"key":"array"}',
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
          enabled: false,
          description: 'your scheduled event description (array)',
          input: {
            key: 'array',
          },
        },
      },
      {
        schedule: {
          rate: 'rate(1 hour)',
          inputTransformer: {
            inputPathsMap: {
              eventTime: '$.time',
            },
            inputTemplate: '{"time": <eventTime>, "key": "value"}',
          },
        },
      },
    ];

    scheduleCfResources = await run(events);
  });

  it('should create the corresponding schedule resources when schedule events are given', () => {
    for (const scheduleCfResource of scheduleCfResources) {
      expect(scheduleCfResource.Type).to.equal('AWS::Events::Rule');
    }
  });

  it('should respect the given rate expressions', () => {
    expect(scheduleCfResources[0].Properties.ScheduleExpression).to.equal('rate(10 minutes)');
    expect(scheduleCfResources[1].Properties.ScheduleExpression).to.equal('rate(1 hour)');
    expect(scheduleCfResources[2].Properties.ScheduleExpression).to.equal('rate(10 minutes)');
    expect(scheduleCfResources[3].Properties.ScheduleExpression).to.equal('rate(10 minutes)');
    expect(scheduleCfResources[4].Properties.ScheduleExpression).to.equal(
      'cron(5,35 12 ? * 6l 2002-2005)'
    );
    expect(scheduleCfResources[5].Properties.ScheduleExpression).to.equal(
      'cron(0 0/4 ? * MON-FRI *)'
    );
    expect(scheduleCfResources[6].Properties.ScheduleExpression).to.equal('rate(1 hour)');
    expect(scheduleCfResources[7].Properties.ScheduleExpression).to.equal('rate(1 hour)');
  });

  it('should respect the "enabled" variable, defaulting to true', () => {
    expect(scheduleCfResources[0].Properties.State).to.equal('DISABLED');
    expect(scheduleCfResources[1].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[2].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[3].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[4].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[5].Properties.State).to.equal('DISABLED');
    expect(scheduleCfResources[6].Properties.State).to.equal('DISABLED');
    expect(scheduleCfResources[7].Properties.State).to.equal('ENABLED');
  });

  it('should respect the "name" variable', () => {
    expect(scheduleCfResources[0].Properties.Name).to.equal('your-scheduled-event-name');
    expect(scheduleCfResources[1].Properties.Name).to.equal('your-scheduled-event-name-array');
    expect(scheduleCfResources[2].Properties.Name).to.be.undefined;
    expect(scheduleCfResources[3].Properties.Name).to.be.undefined;
    expect(scheduleCfResources[4].Properties.Name).to.be.undefined;
    expect(scheduleCfResources[5].Properties.Name).to.be.undefined;
    expect(scheduleCfResources[6].Properties.Name).to.be.undefined;
    expect(scheduleCfResources[7].Properties.Name).to.be.undefined;
  });

  it('should throw an error if a "name" variable is specified when defining more than one rate expression', async () => {
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

  it('should respect the "description" variable', () => {
    expect(scheduleCfResources[0].Properties.Description).to.equal(
      'your scheduled event description'
    );
    expect(scheduleCfResources[1].Properties.Description).to.be.undefined;
    expect(scheduleCfResources[2].Properties.Description).to.be.undefined;
    expect(scheduleCfResources[3].Properties.Description).to.be.undefined;
    expect(scheduleCfResources[4].Properties.Description).to.be.undefined;
    expect(scheduleCfResources[5].Properties.Description).to.equal(
      'your scheduled event description (array)'
    );
    expect(scheduleCfResources[6].Properties.Description).to.equal(
      'your scheduled event description (array)'
    );
    expect(scheduleCfResources[7].Properties.Description).to.be.undefined;
  });

  it('should respect the "inputPath" variable', () => {
    expect(scheduleCfResources[0].Properties.Targets[0].InputPath).to.be.undefined;
    expect(scheduleCfResources[1].Properties.Targets[0].InputPath).to.equal('$.stageVariables');
    expect(scheduleCfResources[2].Properties.Targets[0].InputPath).to.be.undefined;
    expect(scheduleCfResources[3].Properties.Targets[0].InputPath).to.be.undefined;
    expect(scheduleCfResources[4].Properties.Targets[0].InputPath).to.be.undefined;
    expect(scheduleCfResources[5].Properties.Targets[0].InputPath).to.be.undefined;
    expect(scheduleCfResources[6].Properties.Targets[0].InputPath).to.be.undefined;
    expect(scheduleCfResources[7].Properties.Targets[0].InputPath).to.be.undefined;
  });

  it('should respect the "input" variable', () => {
    expect(scheduleCfResources[0].Properties.Targets[0].Input).to.be.undefined;
    expect(scheduleCfResources[1].Properties.Targets[0].Input).to.be.undefined;
    expect(scheduleCfResources[2].Properties.Targets[0].Input).to.equal('{"key":"array"}');
    expect(scheduleCfResources[3].Properties.Targets[0].Input).to.be.undefined;
    expect(scheduleCfResources[4].Properties.Targets[0].Input).to.be.undefined;
    expect(scheduleCfResources[5].Properties.Targets[0].Input).to.equal('{"key":"array"}');
    expect(scheduleCfResources[6].Properties.Targets[0].Input).to.equal('{"key":"array"}');
    expect(scheduleCfResources[7].Properties.Targets[0].Input).to.be.undefined;
  });

  it('should respect the "inputTransformer" variable', () => {
    expect(scheduleCfResources[0].Properties.Targets[0].InputTransformer).to.be.undefined;
    expect(scheduleCfResources[1].Properties.Targets[0].InputTransformer).to.be.undefined;
    expect(scheduleCfResources[2].Properties.Targets[0].InputTransformer).to.be.undefined;
    expect(scheduleCfResources[3].Properties.Targets[0].InputTransformer).to.be.undefined;
    expect(scheduleCfResources[4].Properties.Targets[0].InputTransformer).to.be.undefined;
    expect(scheduleCfResources[5].Properties.Targets[0].InputTransformer).to.be.undefined;
    expect(scheduleCfResources[6].Properties.Targets[0].InputTransformer).to.be.undefined;
    expect(scheduleCfResources[7].Properties.Targets[0].InputTransformer).to.deep.equal({
      InputTemplate: '{"time": <eventTime>, "key": "value"}',
      InputPathsMap: { eventTime: '$.time' },
    });
  });

  it('should not create schedule resources when no scheduled event is given', async () => {
    expect(await run([])).to.be.empty;
  });
});
