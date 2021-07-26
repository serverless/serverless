'use strict';

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const overrideEnv = require('process-utils/override-env');
const overrideCwd = require('process-utils/override-cwd');

const resolveLocalServerless = require('../../../../../lib/cli/resolve-local-serverless-path');
const commandsSchema = require('../../../../../lib/cli/commands-schema');
const generatePayload = require('../../../../../lib/utils/telemetry/generatePayload');
const runServerless = require('../../../../utils/run-serverless');
const fixtures = require('../../../../fixtures/programmatic');

const versions = {
  'serverless': require('../../../../../package').version,
  '@serverless/dashboard-plugin': require('@serverless/dashboard-plugin/package').version,
};

describe('test/unit/lib/utils/telemetry/generatePayload.test.js', () => {
  let isTTYCache;
  before(() => {
    // In order for tests below to return `commandDurationMs`
    EvalError.$serverlessCommandStartTime = process.hrtime();
    isTTYCache = process.stdin.isTTY;
    process.stdin.isTTY = true;
  });

  after(() => {
    process.stdin.isTTY = isTTYCache;
  });

  beforeEach(() => {
    resolveLocalServerless.clear();
  });

  it('Should resolve payload for AWS service', async () => {
    const { servicePath: serviceDir } = await fixtures.setup('httpApi', {
      configExt: {
        provider: {
          runtime: 'nodejs14.x',
        },
        functions: {
          withContainer: {
            image:
              '000000000000.dkr.ecr.sa-east-1.amazonaws.com/test-lambda-docker@sha256:6bb600b4d6e1d7cf521097177dd0c4e9ea373edb91984a505333be8ac9455d38',
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
    await fs.promises.writeFile(
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
    const payload = generatePayload({
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
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      isTtyTerminal: true,
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
          { runtime: 'nodejs14.x', events: [{ type: 'httpApi' }, { type: 'httpApi' }] },
          { runtime: 'nodejs14.x', events: [{ type: 'httpApi' }] },
          { runtime: 'nodejs14.x', events: [] },
          { runtime: 'nodejs14.x', events: [] },
          { runtime: '$containerimage', events: [] },
        ],
        resources: {
          general: ['AWS::Logs::LogGroup', 'AWS::S3::Bucket', 'Custom'],
        },
      },
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      npmDependencies: ['fooDep', 'barDep', 'fooOpt', 'someDev', 'otherDev'],
      triggeredDeprecations: [],
      installationType: 'global:other',
      hasLocalCredentials: false,
      versions,
    });
  });

  it('Should resolve payload for custom provider service', async () => {
    const { serverless } = await runServerless({
      fixture: 'customProvider',
      command: 'print',
    });
    const payload = generatePayload({
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
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      isTtyTerminal: true,
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
        plugins: ['./customProvider'],
        functions: [
          { runtime: 'foo', events: [{ type: 'someEvent' }] },
          { runtime: 'bar', events: [] },
        ],
        resources: undefined,
      },
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      npmDependencies: [],
      triggeredDeprecations: [],
      hasLocalCredentials: false,
      installationType: 'global:other',
      versions,
    });
  });

  it('Should recognize local fallback', async () => {
    const {
      serverless,
      fixtureData: { servicePath: serviceDir },
    } = await runServerless({
      fixture: 'locallyInstalledServerless',
      command: 'print',
      modulesCacheStub: {},
    });
    const payload = overrideCwd(serviceDir, () =>
      generatePayload({
        command: 'print',
        options: {},
        commandSchema: commandsSchema.get('print'),
        serviceDir: serverless.serviceDir,
        configuration: serverless.configurationInput,
        serverless,
      })
    );

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('firstLocalInstallationTimestamp');
    delete payload.firstLocalInstallationTimestamp;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      isTtyTerminal: true,
      command: 'print',
      commandOptionNames: [],
      isConfigValid: null,
      config: {
        configValidationMode: 'error',
        provider: {
          name: 'aws',
          runtime: 'nodejs12.x',
          stage: 'dev',
          region: 'us-east-1',
        },
        plugins: [],
        functions: [],
        resources: { general: [] },
      },
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      npmDependencies: [],
      triggeredDeprecations: [],
      installationType: 'local:fallback',
      hasLocalCredentials: false,
      versions: {
        'serverless': '2.0.0-local',
        '@serverless/dashboard-plugin': '4.0.0-local',
        '@serverless/enterprise-plugin': undefined,
      },
    });
  });

  it('Should resolve service-agnostic payload', async () => {
    const payload = generatePayload({
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
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      isTtyTerminal: true,
      command: 'config',
      commandOptionNames: [],
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      triggeredDeprecations: [],
      installationType: 'global:other',
      versions,
    });
  });

  it('Should resolve service-agnostic payload for command with `serviceDependencyMode: "optional"`', () => {
    const payload = generatePayload({
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
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.deep.equal({
      command: '',
      commandOptionNames: [],
      cliName: 'serverless',
      isTtyTerminal: true,
      isConfigValid: null,
      config: {
        configValidationMode: 'warn',
        provider: {
          name: 'aws',
          runtime: 'nodejs12.x',
          stage: 'dev',
          region: 'us-east-1',
        },
        plugins: [],
        functions: [],
        resources: { general: [] },
      },
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      triggeredDeprecations: [],
      installationType: 'global:other',
      npmDependencies: [],
      hasLocalCredentials: false,
      versions,
    });
  });

  it('Should correctly resolve payload with missing service configuration', () => {
    const payload = generatePayload({
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
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.have.property('commandDurationMs');
    delete payload.commandDurationMs;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      isTtyTerminal: true,
      command: 'plugin list',
      commandOptionNames: [],
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      triggeredDeprecations: [],
      installationType: 'global:other',
      versions,
    });
  });

  it('Should resolve payload with predefined local config', async () => {
    await fs.promises.writeFile(
      path.resolve(os.homedir(), '.serverlessrc'),
      JSON.stringify({
        frameworkId: '123',
        userId: 'some-user-id',
        meta: {
          created_at: 1616151998,
        },
      })
    );

    const payload = generatePayload({
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
    await fs.promises.writeFile(
      path.resolve(os.homedir(), '.serverlessrc'),
      JSON.stringify({
        frameworkId: '123',
        userId: 'some-user-id',
      })
    );

    let payload;

    overrideEnv({ variables: { SERVERLESS_ACCESS_KEY: 'some-key' } }, () => {
      payload = generatePayload({
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
      payload = generatePayload({
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
      payload = generatePayload({
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
    const payload = generatePayload({
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
    const payload = generatePayload({
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
    const payload = generatePayload({
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
        payload = generatePayload({
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
        payload = generatePayload({
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
    const payload = generatePayload({
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
});
