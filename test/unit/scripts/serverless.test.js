'use strict';

const { expect } = require('chai');

const path = require('path');
const spawn = require('child-process-ext/spawn');
const { version } = require('../../../package');
const fixturesEngine = require('../../fixtures');

const serverlessPath = path.resolve(__dirname, '../../../scripts/serverless.js');
const fixturesPath = path.resolve(__dirname, '../../fixtures');

describe('test/unit/scripts/serverless.test.js', () => {
  it('Should display version when "--version" option', async () => {
    const output = String((await spawn('node', [serverlessPath, '-v'])).stdoutBuffer);
    expect(output).to.include(`Framework Core: ${version}`);
  });

  it('Invalid configuration should not prevent help output', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: path.resolve(fixturesPath, 'configSyntaxError'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('You can run commands with');
  });

  it('Invalid configuration should be reported when no help output', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(fixturesPath, 'configSyntaxError'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Your Environment Information');
    }
  });

  it('Should handle exceptions', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(fixturesPath, 'exception'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Your Environment Information');
    }
  });
  it('Should handle uncaught exceptions', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(fixturesPath, 'uncaughtException'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Your Environment Information');
    }
  });

  it('Should handle local serverless installation', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: (await fixturesEngine.setup('locallyInstalledServerless')).servicePath,
        })
      ).stdoutBuffer
    );
    expect(output).to.include('Running "serverless" installed locally');
  });

  it('Should resolve variables', async () => {
    expect(
      String(
        (
          await spawn('node', [serverlessPath, 'print'], {
            cwd: path.resolve(fixturesPath, 'variables'),
          })
        ).stdoutBuffer
      )
    ).to.include('nestedInPrototype: bar-in-prototype');
  });
});
