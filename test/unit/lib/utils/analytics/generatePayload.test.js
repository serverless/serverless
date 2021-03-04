'use strict';

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');
const overrideEnv = require('process-utils/override-env');

const generatePayload = require('../../../../../lib/utils/analytics/generatePayload');
const runServerless = require('../../../../utils/run-serverless');
const fixtures = require('../../../../fixtures');

const versions = {
  'serverless': require('../../../../../package').version,
  '@serverless/enterprise-plugin': require('@serverless/enterprise-plugin/package').version,
};

describe('lib/utils/analytics/generatePayload', () => {
  it('Should resolve payload for AWS service', async () => {
    const { servicePath } = await fixtures.setup('httpApi');
    await fs.promises.writeFile(
      path.resolve(servicePath, 'package.json'),
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
      cwd: servicePath,
      cliArgs: ['-v'],
    });
    const payload = await generatePayload(serverless);

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      config: {
        provider: {
          name: 'aws',
          runtime: 'nodejs12.x',
          stage: 'dev',
          region: 'us-east-1',
        },
        plugins: [],
        functions: [
          { runtime: 'nodejs12.x', events: [{ type: 'httpApi' }, { type: 'httpApi' }] },
          { runtime: 'nodejs12.x', events: [{ type: 'httpApi' }] },
        ],
      },
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      npmDependencies: ['fooDep', 'barDep', 'fooOpt', 'someDev', 'otherDev'],
      triggeredDeprecations: [],
      installationType: 'global:other',
      versions,
    });
  });

  it('Should resolve payload for custom provider service', async () => {
    const { serverless } = await runServerless({
      fixture: 'customProvider',
      cliArgs: ['config'],
    });
    const payload = await generatePayload(serverless);

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      config: {
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
      },
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      npmDependencies: [],
      triggeredDeprecations: [],
      installationType: 'global:other',
      versions,
    });
  });

  it('Should recognize local fallback', async () => {
    const { serverless } = await runServerless({
      fixture: 'locallyInstalledServerless',
      cliArgs: ['config'],
      modulesCacheStub: {},
    });
    const payload = await generatePayload(serverless);

    expect(payload).to.have.property('frameworkLocalUserId');
    delete payload.frameworkLocalUserId;
    expect(payload).to.have.property('timestamp');
    delete payload.timestamp;
    expect(payload).to.have.property('dashboard');
    delete payload.dashboard;
    expect(payload).to.have.property('timezone');
    delete payload.timezone;
    expect(payload).to.have.property('ciName');
    delete payload.ciName;
    expect(payload).to.deep.equal({
      cliName: 'serverless',
      config: {
        provider: {
          name: 'aws',
          runtime: 'nodejs12.x',
          stage: 'dev',
          region: 'us-east-1',
        },
        plugins: [],
        functions: [],
      },
      isAutoUpdateEnabled: false,
      isTabAutocompletionInstalled: false,
      npmDependencies: [],
      triggeredDeprecations: [],
      installationType: 'local:fallback',
      versions,
    });
  });

  it('Should resolve payload with predefined local config', async () => {
    const { serverless } = await runServerless({
      fixture: 'customProvider',
      cliArgs: ['config'],
    });

    await fs.promises.writeFile(
      path.resolve(os.homedir(), '.serverlessrc'),
      JSON.stringify({
        frameworkId: '123',
        userId: 'some-user-id',
      })
    );

    const payload = await generatePayload(serverless);
    expect(payload.dashboard.userId).to.equal('some-user-id');
    expect(payload.frameworkLocalUserId).to.equal('123');
  });

  it('Should not include userId from local config if SERVERLESS_ACCESS_KEY used', async () => {
    const { serverless } = await runServerless({
      fixture: 'customProvider',
      cliArgs: ['config'],
    });

    await fs.promises.writeFile(
      path.resolve(os.homedir(), '.serverlessrc'),
      JSON.stringify({
        frameworkId: '123',
        userId: 'some-user-id',
      })
    );

    let payload;

    await overrideEnv({ variables: { SERVERLESS_ACCESS_KEY: 'some-key' } }, async () => {
      payload = await generatePayload(serverless);
    });
    expect(payload.dashboard.userId).to.be.null;
    expect(payload.frameworkLocalUserId).to.equal('123');
  });
});
