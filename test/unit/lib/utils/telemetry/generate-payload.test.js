'use strict';

const { expect } = require('chai');
const path = require('path');
const fsp = require('fs').promises;
const os = require('os');
const overrideEnv = require('process-utils/override-env');
const proxyquire = require('proxyquire');

const commandsSchema = require('../../../../../lib/cli/commands-schema');
const runServerless = require('../../../../utils/run-serverless');
const fixtures = require('../../../../fixtures/programmatic');

const versions = {
  'serverless': require('../../../../../package').version,
  '@serverless/dashboard-plugin': require('@serverless/dashboard-plugin/package').version,
};

const getGeneratePayload = () =>
  proxyquire('../../../../../lib/utils/telemetry/generate-payload', {
    '@serverless/utils/get-notifications-mode': () => 'on',
  });

describe('test/unit/lib/utils/telemetry/generatePayload.test.js', () => {
  let isTTYCache;
  let originalModulesCache;
  before(() => {
    // In order for tests below to return `commandDurationMs`
    EvalError.$serverlessCommandStartTime = process.hrtime();
    isTTYCache = process.stdin.isTTY;
    process.stdin.isTTY = true;
    originalModulesCache = Object.assign({}, require.cache);
  });

  after(() => {
    process.stdin.isTTY = isTTYCache;
    for (const key of Object.keys(require.cache)) delete require.cache[key];
    Object.assign(require.cache, originalModulesCache);
  });

  beforeEach(() => {
    for (const key of Object.keys(require.cache)) delete require.cache[key];
  });

  it('Should resolve payload for AWS service', async () => {
    const { servicePath: serviceDir } = await fixtures.setup('http-api', {
      configExt: {
        provider: {
          runtime: 'nodejs14.x',
        },
        functions: {
          withContainer: {
            image:
              '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
          },
          withUrl: {
            handler: 'index.handler',
            url: true,
          },
        },
        resources: {
          Resources: {
            ExtraLogGroup: {
              Type: 'AWS::Logs::LogGroup',
              Properties: {
                LogGroupName: '/aws/lambda/extra-log',
              },
            },
            AnotherExtraLogGroup: {
              Type: 'AWS::Logs::LogGroup',
              Properties: {
                LogGroupName: '/aws/lambda/extra-log-2',
              },
            },
            ExtraBucket: {
              Type: 'AWS::S3::Bucket',
            },
            ExtraCustom: {
              Type: 'Custom::Matthieu',
            },
          },
          extensions: {
            FunctionLambdaFunction: {
              Properties: {
                Runtime: 'nodejs14.x',
              },
            },
          },
        },
      },
    });
    await fsp.writeFile(
      path.resolve(serviceDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          fooDep: '1',
          barDep: '2',
        },
        optionalDependencies: {
          fooOpt: '1',
          fooDep: '1',
        },
        devDependencies: {
          someDev: '1',
          otherDev: '1',
        },
      })
    );

    const { serverless } = await runServerless({
      cwd: serviceDir,
      command: 'print',
    });
    const payload = getGeneratePayload()({
      command: 'print',
      options: {},
      commandSchema: commandsSchema.get('print'),
      serviceDir,
      configuration: serverless.configurationInput,
    });

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('firstLocalInstallationTimestamp');
    delete payload.firstLocalInstallationTimestamp;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('console');
    delete payload.console;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.have.property('isTtyTerminal');
    delete payload.isTtyTerminal;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      command: 'print',
      commandOptionNames: [],
      isConfigValid: true,
      config: {
        configValidationMode: 'error',
        provider: {
          name: 'aws',
          runtime: 'nodejs14.x',
          stage: 'dev',
          region: 'us-east-1',
        },
        plugins: [],
        functions: [
          { runtime: 'nodejs14.x', events: [{ type: 'httpApi' }, { type: 'httpApi' }], url: false },
          { runtime: 'nodejs14.x', events: [{ type: 'httpApi' }], url: false },
          { runtime: 'nodejs14.x', events: [], url: false },
          { runtime: 'nodejs14.x', events: [], url: false },
          { runtime: '$containerimage', events: [], url: false },
          { runtime: 'nodejs14.x', events: [], url: true },
        ],
        resources: {
          general: ['AWS::Logs::LogGroup', 'AWS::S3::Bucket', 'Custom'],
        },
        variableSources: [],
        paramsCount: 0,
      },
      isAutoUpdateEnabled: false,
      isUsingCompose: false,
      notificationsMode: 'on',
      npmDependencies: ['fooDep', 'barDep', 'fooOpt', 'someDev', 'otherDev'],
      triggeredDeprecations: [],
      installationType: 'global:other',
      hasLocalCredentials: false,
      versions,
    });
  });

  it('Should resolve payload for custom provider service', async () => {
    const { serverless } = await runServerless({
      fixture: 'custom-provider',
      command: 'print',
    });
    const payload = getGeneratePayload()({
      command: 'print',
      options: {},
      commandSchema: commandsSchema.get('print'),
      serviceDir: serverless.serviceDir,
      configuration: serverless.configurationInput,
      serverless,
    });

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('firstLocalInstallationTimestamp');
    delete payload.firstLocalInstallationTimestamp;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('console');
    delete payload.console;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.have.property('isTtyTerminal');
    delete payload.isTtyTerminal;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      command: 'print',
      commandOptionNames: [],
      isConfigValid: false, // No schema for custom provider
      config: {
        configValidationMode: 'warn',
        provider: {
          name: 'customProvider',
          runtime: 'foo',
          stage: 'dev',
          region: undefined,
        },
        plugins: ['./custom-provider'],
        functions: [
          { runtime: 'foo', events: [{ type: 'someEvent' }], url: false },
          { runtime: 'bar', events: [], url: false },
        ],
        resources: undefined,
        variableSources: [],
        paramsCount: 0,
      },
      isAutoUpdateEnabled: false,
      isUsingCompose: false,
      notificationsMode: 'on',
      npmDependencies: [],
      triggeredDeprecations: [],
      hasLocalCredentials: false,
      installationType: 'global:other',
      versions,
    });
  });

  it('Should resolve service-agnostic payload', async () => {
    const payload = getGeneratePayload()({
      command: 'config',
      options: {},
      commandSchema: commandsSchema.get('config'),
      serviceDir: process.cwd(),
      configuration: { service: 'foo', provider: 'aws' },
    });

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('firstLocalInstallationTimestamp');
    delete payload.firstLocalInstallationTimestamp;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('console');
    delete payload.console;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.have.property('isTtyTerminal');
    delete payload.isTtyTerminal;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      command: 'config',
      commandOptionNames: [],
      isAutoUpdateEnabled: false,
      isUsingCompose: false,
      notificationsMode: 'on',
      triggeredDeprecations: [],
      installationType: 'global:other',
      versions,
    });
  });

  it('Should resolve service-agnostic payload for command with `serviceDependencyMode: "optional"`', () => {
    const payload = getGeneratePayload()({
      command: '',
      options: {},
      commandSchema: commandsSchema.get(''),
      serviceDir: process.cwd(),
      configuration: { service: 'foo', provider: 'aws' },
    });

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('firstLocalInstallationTimestamp');
    delete payload.firstLocalInstallationTimestamp;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('console');
    delete payload.console;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.have.property('isTtyTerminal');
    delete payload.isTtyTerminal;
    expect(payload).to.deep.equal({
      command: '',
      commandOptionNames: [],
      cliName: 'serverless',
      isConfigValid: null,
      config: {
        configValidationMode: 'warn',
        variableSources: [],
        provider: {
          name: 'aws',
          runtime: 'nodejs12.x',
          stage: 'dev',
          region: 'us-east-1',
        },
        plugins: [],
        functions: [],
        resources: { general: [] },
        paramsCount: 0,
      },
      isAutoUpdateEnabled: false,
      isUsingCompose: false,
      triggeredDeprecations: [],
      installationType: 'global:other',
      notificationsMode: 'on',
      npmDependencies: [],
      hasLocalCredentials: false,
      versions,
    });
  });

  it('Should correctly resolve payload with missing service configuration', () => {
    const payload = getGeneratePayload()({
      command: 'plugin list',
      options: {},
      commandSchema: commandsSchema.get('plugin list'),
    });

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('firstLocalInstallationTimestamp');
    delete payload.firstLocalInstallationTimestamp;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('console');
    delete payload.console;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.have.property('isTtyTerminal');
    delete payload.isTtyTerminal;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      command: 'plugin list',
      commandOptionNames: [],
      isAutoUpdateEnabled: false,
      isUsingCompose: false,
      notificationsMode: 'on',
      triggeredDeprecations: [],
      installationType: 'global:other',
      versions,
    });
  });

  it('Should resolve payload with predefined local config', async () => {
    await fsp.writeFile(
      path.resolve(os.homedir(), '.serverlessrc'),
      JSON.stringify({
        frameworkId: '123',
        userId: 'some-user-id',
        meta: {
          created_at: 1616151998,
        },
      })
    );

    const payload = getGeneratePayload()({
      command: 'config',
      options: {},
      commandSchema: commandsSchema.get('config'),
      serviceDir: process.cwd(),
      configuration: { service: 'foo', provider: 'aws' },
    });
    expect(payload.dashboard.userId).to.equal('some-user-id');
    expect(payload.frameworkLocalUserId).to.equal('123');
    expect(payload.firstLocalInstallationTimestamp).to.equal(1616151998);
  });

  it('Should not include userId from local config if SERVERLESS_ACCESS_KEY used', async () => {
    await fsp.writeFile(
      path.resolve(os.homedir(), '.serverlessrc'),
      JSON.stringify({
        frameworkId: '123',
        userId: 'some-user-id',
      })
    );

    let payload;

    overrideEnv({ variables: { SERVERLESS_ACCESS_KEY: 'some-key' } }, () => {
      payload = getGeneratePayload()({
        command: 'config',
        options: {},
        commandSchema: commandsSchema.get('config'),
        serviceDir: process.cwd(),
        configuration: { service: 'foo', provider: 'aws' },
      });
    });
    expect(payload.dashboard.userId).to.be.null;
    expect(payload.frameworkLocalUserId).to.equal('123');
  });

  it('Should correctly detect Serverless CI/CD', () => {
    let payload;

    overrideEnv({ variables: { SERVERLESS_CI_CD: 'true' } }, () => {
      payload = getGeneratePayload()({
        command: 'config',
        options: {},
        commandSchema: commandsSchema.get('config'),
        serviceDir: process.cwd(),
        configuration: { service: 'foo', provider: 'aws' },
      });
    });
    expect(payload.ciName).to.equal('Serverless CI/CD');
  });

  it('Should correctly detect Seed CI/CD', () => {
    let payload;

    overrideEnv({ variables: { SEED_APP_NAME: 'some-app' } }, () => {
      payload = getGeneratePayload()({
        command: 'config',
        options: {},
        commandSchema: commandsSchema.get('config'),
        serviceDir: process.cwd(),
        configuration: { service: 'foo', provider: 'aws' },
      });
    });
    expect(payload.ciName).to.equal('Seed');
  });

  it('Should correctly resolve `commandOptionNames` property', () => {
    const payload = getGeneratePayload()({
      command: 'print',
      options: {
        region: 'eu-west-1',
        format: 'json',
        path: 'provider.name',
      },
      commandSchema: commandsSchema.get('print'),
      serviceDir: process.cwd(),
      configuration: { service: 'foo', provider: 'aws' },
    });

    expect(new Set(payload.commandOptionNames)).to.deep.equal(
      new Set(['region', 'format', 'path'])
    );
  });

  it('Should correctly resolve `constructs` property', () => {
    const payload = getGeneratePayload()({
      command: 'print',
      commandSchema: commandsSchema.get('print'),
      options: {},
      serviceDir: process.cwd(),
      configuration: {
        service: 'foo',
        provider: 'aws',
        constructs: {
          jobs: {
            type: 'queue',
            worker: {
              handler: 'some.handler',
            },
          },
          another: {
            type: 'queue',
            worker: {
              handler: 'other.handler',
            },
          },
        },
        plugins: ['serverless-lift'],
      },
    });
    expect(payload.config.constructs).to.deep.equal([
      {
        type: 'queue',
      },
      {
        type: 'queue',
      },
    ]);
  });

  it('Should correctly resolve `configValidationMode` property', () => {
    const payload = getGeneratePayload()({
      command: 'print',
      commandSchema: commandsSchema.get('print'),
      options: {},
      serviceDir: process.cwd(),
      configuration: {
        service: 'foo',
        provider: 'aws',
        configValidationMode: 'off',
      },
    });
    expect(payload.config.configValidationMode).to.equal('off');
  });

  it('Should correctly resolve `hasLocalCredentials` property for AWS provider', () => {
    let payload;
    overrideEnv(
      { variables: { AWS_ACCESS_KEY_ID: 'someaccesskey', AWS_SECRET_ACCESS_KEY: 'secretkey' } },
      () => {
        payload = getGeneratePayload()({
          command: 'print',
          options: {},
          commandSchema: commandsSchema.get('print'),
          serviceDir: process.cwd(),
          configuration: { service: 'foo', provider: 'aws' },
        });
      }
    );

    expect(payload.hasLocalCredentials).to.equal(true);
  });

  it('Should correctly resolve `hasLocalCredentials` property for non-AWS provider', () => {
    let payload;
    overrideEnv(
      { variables: { AWS_ACCESS_KEY_ID: 'someaccesskey', AWS_SECRET_ACCESS_KEY: 'secretkey' } },
      () => {
        payload = getGeneratePayload()({
          command: 'print',
          options: {},
          commandSchema: commandsSchema.get('print'),
          serviceDir: process.cwd(),
          configuration: { service: 'foo', provider: 'other' },
        });
      }
    );

    expect(payload.hasLocalCredentials).to.equal(false);
  });

  it('Should correctly resolve `commandUsage` property', () => {
    const payload = getGeneratePayload()({
      command: 'print',
      options: {},
      commandSchema: commandsSchema.get('print'),
      serviceDir: process.cwd(),
      configuration: { service: 'foo', provider: 'aws' },
      commandUsage: [
        {
          name: 'firstStep',
          history: [
            {
              key: 'firstQuestion',
              value: 'answer',
              timestamp: 1626220800000,
            },
            {
              key: 'otherQuestion',
              value: 'otherAnswer',
              timestamp: 1626220800000,
            },
          ],
        },
      ],
    });

    expect(payload.commandUsage).to.deep.equal([
      {
        name: 'firstStep',
        history: [
          {
            key: 'firstQuestion',
            value: 'answer',
            timestamp: 1626220800000,
          },
          {
            key: 'otherQuestion',
            value: 'otherAnswer',
            timestamp: 1626220800000,
          },
        ],
      },
    ]);
  });

  it('Should correctly resolve `variableSources` property', () => {
    const payload = getGeneratePayload()({
      command: 'print',
      options: {},
      commandSchema: commandsSchema.get('print'),
      serviceDir: process.cwd(),
      configuration: { service: 'foo', provider: 'aws' },
      commandUsage: [],
      variableSources: new Set(['ssm', 'opt']),
    });

    expect(payload.config.variableSources).to.deep.equal(['ssm', 'opt']);
  });

  it('Should correctly resolve projectId property', async () => {
    const { serverless } = await runServerless({
      fixture: 'http-api',
      command: 'print',
      configExt: {
        service: 'to-ensure-unique-serivce-name',
      },
    });
    serverless.getProvider('aws').accountId = '1234567890';
    const payload = getGeneratePayload()({
      command: 'deploy',
      options: {},
      commandSchema: commandsSchema.get('deploy'),
      serviceDir: serverless.serviceDir,
      configuration: serverless.configurationInput,
      serverless,
    });

    expect(payload.projectId).to.deep.equal('35dsFwCaexwLHppAP4uDsjKW4ci54q1AKcN5JTNaDtw=');
  });

  it('Should correctly resolve `didCreateService` property', async () => {
    const { serverless } = await runServerless({
      fixture: 'http-api',
      command: 'print',
      configExt: {
        service: 'to-ensure-unique-serivce-name',
      },
    });
    serverless.getProvider('aws').didCreateService = true;
    const payload = getGeneratePayload()({
      command: '',
      options: {},
      commandSchema: commandsSchema.get('deploy'),
      serviceDir: serverless.serviceDir,
      configuration: serverless.configurationInput,
      serverless,
    });

    expect(payload.didCreateService).to.be.true;
  });

  it('Should correctly resolve `params` property', () => {
    const payload = getGeneratePayload()({
      command: 'print',
      options: {},
      commandSchema: commandsSchema.get('print'),
      serviceDir: process.cwd(),
      configuration: {
        service: 'foo',
        provider: 'aws',
        params: {
          prod: {
            val: '1',
            other: '2',
          },
          staging: {
            val: 'dev',
            stagingonly: '1',
          },
          dev: {
            devonly: 123,
          },
        },
      },
      commandUsage: [],
    });

    expect(payload.config.paramsCount).to.equal(4);
  });

  it('Should correctly resolve `isUsingCompose` property', async () => {
    let payload;
    overrideEnv({ variables: { SLS_COMPOSE: '1' } }, () => {
      payload = getGeneratePayload()({
        command: 'print',
        options: {},
        commandSchema: commandsSchema.get('print'),
        serviceDir: process.cwd(),
        configuration: { service: 'foo', provider: 'aws' },
      });
    });
    expect(payload.isUsingCompose).to.be.true;
  });
});
