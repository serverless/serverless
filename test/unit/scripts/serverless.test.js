'use strict';

const { expect } = require('chai');

const path = require('path');
const fs = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const { version } = require('../../../package');
const fixturesEngine = require('../../fixtures');

const serverlessPath = path.resolve(__dirname, '../../../scripts/serverless.js');
const fixturesPath = path.resolve(__dirname, '../../fixtures');

describe('test/unit/scripts/serverless.test.js', () => {
  it('should display version when "--version" option', async () => {
    const output = String((await spawn('node', [serverlessPath, '-v'])).stdoutBuffer);
    expect(output).to.include(`Framework Core: ${version}`);
  });

  it('should not prevent help output with invalid service configuration', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: path.resolve(fixturesPath, 'configSyntaxError'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('You can run commands with');
  });

  it('should report with an error invalid configuration', async () => {
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

  it('should handle exceptions', async () => {
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

  it('should handle uncaught exceptions', async () => {
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

  it('should handle local serverless installation', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: (await fixturesEngine.setup('locallyInstalledServerless')).servicePath,
        })
      ).stdoutBuffer
    );
    expect(output).to.include('Running "serverless" installed locally');
  });

  it('should handle no service related commands', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, 'plugin', 'list'], {
          cwd: path.resolve(fixturesPath, 'configSyntaxError'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('To install a plugin run');
  });

  it('should resolve variables', async () => {
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

  it('should rejected unresolved "provider" section', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await fixturesEngine.setup('aws', {
            configExt: { variablesResolutionMode: '20210219', provider: '${foo:bar}' },
          })
        ).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('"provider.stage" property is not accessible');
    }
  });

  it('should rejected unresolved "provider.stage" property', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await fixturesEngine.setup('aws', {
            configExt: { variablesResolutionMode: '20210219', provider: { stage: '${foo:bar}' } },
          })
        ).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('"provider.stage" property is not accessible');
    }
  });

  it('should load env variables from dotenv files', async () => {
    const { servicePath } = await fixturesEngine.setup('aws', {
      configExt: {
        useDotenv: true,
        custom: {
          fromDefaultEnv: '${env:DEFAULT_ENV_VARIABLE}',
        },
      },
    });
    await fs.writeFile(path.resolve(servicePath, '.env'), 'DEFAULT_ENV_VARIABLE=valuefromdefault');
    expect(
      String((await spawn('node', [serverlessPath, 'print'], { cwd: servicePath })).stdoutBuffer)
    ).to.include('fromDefaultEnv: valuefromdefault');
  });

  it('should reject unresolved "plugins" property', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await fixturesEngine.setup('aws', {
            configExt: { variablesResolutionMode: '20210219', plugins: '${foo:bar}' },
          })
        ).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('"plugins" property is not accessible');
    }
  });
});
