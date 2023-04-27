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

      const scheduleLogicalId =
        schedule.method === 'scheduler'
          ? awsNaming.getSchedulerScheduleLogicalId('test', index)
          : awsNaming.getScheduleLogicalId('test', index);
      const scheduleCfResource = cfResources[scheduleLogicalId];
      scheduleCfResource.serviceName = awsNaming.provider.serverless.service.service;

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
          method: 'eventBus',
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
      {
        schedule: {
          rate: 'rate(15 minutes)',
          method: 'scheduler',
          name: 'scheduler-scheduled-event',
          description: 'Scheduler Scheduled Event',
          input: '{"key":"array"}',
        },
      },
      {
        schedule: {
          rate: 'cron(15 10 ? * SAT-SUN *)',
          enabled: false,
          method: 'scheduler',
        },
      },
      {
        schedule: {
          rate: [{ 'Fn::If': ['Condition', 'cron(0 0/4 ? * MON-FRI *)', 'rate(1 hour)'] }],
        },
      },
    ];

    scheduleCfResources = await run(events);
  });

  it('should respect the "method" variable when creating the resource', () => {
    expect(scheduleCfResources[0].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[1].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[2].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[3].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[4].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[5].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[6].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[7].Type).to.equal('AWS::Events::Rule');
    expect(scheduleCfResources[8].Type).to.equal('AWS::Scheduler::Schedule');
    expect(scheduleCfResources[9].Type).to.equal('AWS::Scheduler::Schedule');
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
    expect(scheduleCfResources[8].Properties.ScheduleExpression).to.equal('rate(15 minutes)');
    expect(scheduleCfResources[9].Properties.ScheduleExpression).to.equal(
      'cron(15 10 ? * SAT-SUN *)'
    );
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
    expect(scheduleCfResources[8].Properties.State).to.equal('ENABLED');
    expect(scheduleCfResources[9].Properties.State).to.equal('DISABLED');
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
    expect(scheduleCfResources[8].Properties.Name).to.equal('scheduler-scheduled-event');
    expect(scheduleCfResources[9].Properties.Name).to.be.undefined;
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
    expect(scheduleCfResources[8].Properties.Description).to.equal('Scheduler Scheduled Event');
    expect(scheduleCfResources[9].Properties.Description).to.be.undefined;
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
    expect(scheduleCfResources[8].Properties.Target.InputPath).to.be.undefined;
    expect(scheduleCfResources[9].Properties.Target.InputPath).to.be.undefined;
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
    expect(scheduleCfResources[8].Properties.Target.Input).to.equal('{"key":"array"}');
    expect(scheduleCfResources[9].Properties.Target.Input).to.be.undefined;
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
    expect(scheduleCfResources[8].Properties.Target.InputTransformer).to.be.undefined;
    expect(scheduleCfResources[9].Properties.Target.InputTransformer).to.be.undefined;
  });

  it('should throw when passing "inputPath" or "inputTransformer" to method:schedule resources', async () => {
    const events = [
      {
        schedule: {
          rate: 'rate(15 minutes)',
          method: 'scheduler',
          inputPath: '$.stageVariables',
        },
      },
      {
        schedule: {
          rate: 'rate(15 minutes)',
          method: 'scheduler',
          inputTransformer: {
            inputPathsMap: { eventTime: '$.time' },
            inputTemplate: '{"time": <eventTime>, "key": "value"}',
          },
        },
      },
    ];

    await expect(run([events[0]])).to.be.eventually.rejectedWith(
      ServerlessError,
      "Configuration error at 'functions.test.events.0.schedule.method': must be equal to one of the allowed values [eventBus]\n\nLearn more about configuration validation here: http://slss.io/configuration-validation"
    );

    await expect(run([events[1]])).to.be.eventually.rejectedWith(
      ServerlessError,
      "Configuration error at 'functions.test.events.0.schedule.method': must be equal to one of the allowed values [eventBus]\n\nLearn more about configuration validation here: http://slss.io/configuration-validation"
    );
  });

  it('should pass the roleArn to method:schedule resources', () => {
    expect(scheduleCfResources[8].Properties.Target.RoleArn).to.deep.equal({
      'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
    });
    expect(scheduleCfResources[9].Properties.Target.RoleArn).to.deep.equal({
      'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
    });
  });

  it('should not create schedule resources when no scheduled event is given', async () => {
    expect(await run([])).to.be.empty;
  });
});
