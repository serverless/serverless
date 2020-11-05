'use strict';

const { expect } = require('chai');
const path = require('path');
const fse = require('fs-extra');

const generatePayload = require('./generatePayload');
const runServerless = require('../../../test/utils/run-serverless');
const fixtures = require('../../../test/fixtures');

const versions = {
  'serverless': require('../../../package').version,
  '@serverless/enterprise-plugin': require('@serverless/enterprise-plugin/package').version,
};

describe('lib/utils/analytics/generatePayload', () => {
  it('Should resolve payload for AWS service', async () => {
    const { servicePath } = await fixtures.setup('httpApi');
    await fse.writeFile(
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
      isDashboardEnabled: false,
      versions,
    });
  });

  it('Should resolve payload for custom provider service', async () => {
    const { serverless } = await runServerless({
      fixture: 'customProvider',
      cliArgs: ['config'],
    });
    const payload = await generatePayload(serverless);
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
      isDashboardEnabled: false,
      versions,
    });
  });

  it('Should recognize local fallback', async () => {
    const { serverless } = await runServerless({
      fixture: 'locallyInstalledServerless',
      cliArgs: ['config'],
    });
    const payload = await generatePayload(serverless);
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
      isDashboardEnabled: false,
      versions,
    });
  });
});
