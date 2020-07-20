'use strict';

const { expect } = require('chai');
const path = require('path');
const fse = require('fs-extra');

const generatePayload = require('./generatePayload');
const runServerless = require('../../../tests/utils/run-serverless');
const fixtures = require('../../../tests/fixtures');

const versions = {
  'serverless': require('../../../package').version,
  '@serverless/enterprise-plugin': require('@serverless/enterprise-plugin/package').version,
};

describe('lib/utils/analytics/generatePayload', () => {
  after(() => fixtures.cleanup({ extraPaths: ['package.json'] }));

  it('Should resolve payload for AWS service', () =>
    fse
      .writeFile(
        path.resolve(fixtures.map.httpApi, 'package.json'),
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
      )
      .then(() =>
        runServerless({
          cwd: fixtures.map.httpApi,
          cliArgs: ['-v'],
        }).then(({ serverless }) => {
          const payload = generatePayload(serverless);
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
            npmDependencies: ['fooDep', 'barDep', 'fooOpt', 'someDev', 'otherDev'],
            isDashboardEnabled: false,
            versions,
          });
        })
      ));

  it('Should resolve payload for custom provider service', () =>
    runServerless({
      cwd: fixtures.map.customProvider,
      cliArgs: ['config'],
    }).then(({ serverless }) => {
      const payload = generatePayload(serverless);
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
        npmDependencies: [],
        isDashboardEnabled: false,
        versions,
      });
    }));
});
