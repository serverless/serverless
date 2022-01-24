'use strict';

const chai = require('chai');
const path = require('path');
const spawn = require('child-process-ext/spawn');
const { expect } = require('chai');
const fixturesEngine = require('../../fixtures/programmatic');

chai.use(require('chai-as-promised'));

const serverlessPath = path.resolve(__dirname, '../../../scripts/serverless.js');

describe('test/unit/commands/doctor.test.js', async () => {
  before(() => {
    process.env.SLS_DEPRECATION_NOTIFICATION_MODE = 'warn:summary';
  });

  it('should print health status after command which triggered deprecation', async () => {
    const { servicePath: serviceDir } = await fixturesEngine.setup('http-api', {
      configExt: {
        provider: {
          httpApi: {
            useProviderTags: true,
          },
        },
      },
    });
    // Trigger deprecation
    await spawn('node', [serverlessPath, 'print'], { cwd: serviceDir });

    // Gather Health status
    expect(String((await spawn('node', [serverlessPath, 'doctor'])).stdoutBuffer)).to.include(
      'deprecation triggered in the last command'
    );
  });

  it('should inform of no issues when no health status found', async () => {
    // Trigger command that reports no issues
    await spawn('node', [serverlessPath, 'config', '--help']);

    // Gather Health status
    expect(String((await spawn('node', [serverlessPath, 'doctor'])).stdoutBuffer)).to.be.empty;
  });
});
