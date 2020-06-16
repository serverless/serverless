'use strict';

const { expect } = require('chai');

const generatePayload = require('./generatePayload');
const runServerless = require('../../../tests/utils/run-serverless');
const fixtures = require('../../../tests/fixtures');

const versions = {
  'serverless': require('../../../package').version,
  '@serverless/enterprise-plugin': require('@serverless/enterprise-plugin/package').version,
};

describe('lib/utils/analytics/generatePayload', () => {
  after(fixtures.cleanup);

  it('Should resolve payload for AWS service', () =>
    runServerless({
      cwd: fixtures.map.httpApi,
      cliArgs: ['-v'],
    }).then(serverless => {
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
        isDashboardEnabled: false,
        versions,
      });
    }));

  it('Should resolve payload for custom provider service', () =>
    runServerless({
      cwd: fixtures.map.customProvider,
      cliArgs: ['config'],
    }).then(serverless => {
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
        isDashboardEnabled: false,
        versions,
      });
    }));
});
