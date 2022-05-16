'use strict';

const { expect } = require('chai');

const path = require('path');
const fsp = require('fs').promises;
const spawn = require('child-process-ext/spawn');
const stripAnsi = require('strip-ansi');
const { version } = require('../../../package');
const programmaticFixturesEngine = require('../../fixtures/programmatic');

const serverlessBinPath = path.resolve(__dirname, '../../../bin/serverless.js');
const serverlessPath = path.resolve(__dirname, '../../../scripts/serverless.js');
const programmaticFixturesPath = path.resolve(__dirname, '../../fixtures/programmatic');
const cliFixturesPath = path.resolve(__dirname, '../../fixtures/cli');

describe('test/unit/scripts/serverless.test.js', () => {
  it('should display version when "--version" option', async () => {
    const output = String((await spawn('node', [serverlessPath, '-v'])).stdoutBuffer);
    expect(output).to.include(`Framework Core: ${version}`);
  });

  it('should not prevent help output with invalid service configuration', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: path.resolve(cliFixturesPath, 'config-syntax-error'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('serverless <command> <options>');
  });

  it('should report with an error invalid configuration', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(cliFixturesPath, 'config-syntax-error'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Cannot parse');
    }
  });

  it('should handle exceptions', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(programmaticFixturesPath, 'exception'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Error: Stop');
    }
  });

  it('should handle uncaught exceptions', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: path.resolve(cliFixturesPath, 'uncaught-exception'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Error: Stop');
    }
  });

  it('should handle local serverless installation', async () => {
    const output = String(
      (
        await spawn('node', [serverlessBinPath, '--help'], {
          cwd: (await programmaticFixturesEngine.setup('locally-installed-serverless')).servicePath,
        })
      ).stderrBuffer
    );
    expect(output).to.include('Running "serverless" from node_modules');
  });

  it('should handle no service related commands', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, 'plugin', 'list'], {
          cwd: path.resolve(cliFixturesPath, 'config-syntax-error'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('Install a plugin by running');
  });

  it('should resolve variables', async () => {
    expect(
      String(
        (
          await spawn('node', [serverlessPath, 'print'], {
            cwd: path.resolve(cliFixturesPath, 'variables'),
          })
        ).stdoutBuffer
      )
    ).to.include('nestedInPrototype: bar-in-prototype');
  });

  it('should support multi service project', async () => {
    expect(
      String(
        (
          await spawn('node', [serverlessPath, 'print'], {
            cwd: path.resolve(programmaticFixturesPath, 'multi-service/service-a'),
          })
        ).stdoutBuffer
      )
    ).to.include('self: bar');
  });

  it('should support "-c" flag', async () => {
    expect(
      String(
        (
          await spawn('node', [serverlessPath, 'print', '-c', 'serverless.custom.yml'], {
            cwd: path.resolve(programmaticFixturesPath, 'custom-config-filename'),
          })
        ).stdoutBuffer
      )
    ).to.include('looks: good');
  });

  it('should support "-c" flag for "aws-service" commands', async () => {
    try {
      await spawn('node', [serverlessPath, 'info', '-c', 'serverless.custom.yml'], {
        cwd: path.resolve(programmaticFixturesPath, 'custom-config-filename'),
      });
      throw new Error('Unexpected');
    } catch (error) {
      // The way to validate it is to check if command errors out with missing credentials
      // at this point we know the configuration was resolved properly
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('AWS provider credentials not found');
    }
  });

  it('should rejected unresolved "provider" section', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await programmaticFixturesEngine.setup('aws', {
            configExt: { provider: '${foo:bar}' },
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
          await programmaticFixturesEngine.setup('aws', {
            configExt: { provider: { stage: '${foo:bar}' } },
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
    const { servicePath: serviceDir } = await programmaticFixturesEngine.setup('aws', {
      configExt: {
        useDotenv: true,
        custom: {
          fromDefaultEnv: '${env:DEFAULT_ENV_VARIABLE}',
        },
      },
    });
    await fsp.writeFile(path.resolve(serviceDir, '.env'), 'DEFAULT_ENV_VARIABLE=valuefromdefault');
    expect(
      String((await spawn('node', [serverlessPath, 'print'], { cwd: serviceDir })).stdoutBuffer)
    ).to.include('fromDefaultEnv: valuefromdefault');
  });

  it('should allow not defined environment variables in provider.stage`', async () => {
    const { servicePath: serviceDir } = await programmaticFixturesEngine.setup('aws', {
      configExt: {
        useDotenv: true,
        provider: {
          stage: "${env:FOO, 'dev'}",
        },
        custom: {
          fromDefaultEnv: '${env:DEFAULT_ENV_VARIABLE}',
        },
      },
    });
    await fsp.writeFile(path.resolve(serviceDir, '.env'), 'DEFAULT_ENV_VARIABLE=valuefromdefault');
    const printOut = String(
      (await spawn('node', [serverlessPath, 'print'], { cwd: serviceDir })).stdoutBuffer
    );
    expect(printOut).to.include('fromDefaultEnv: valuefromdefault');
    expect(printOut).to.include('stage: dev');
  });

  it('should report "env" variables resolution conflicts with exception', async () => {
    const { servicePath: serviceDir } = await programmaticFixturesEngine.setup('aws', {
      configExt: {
        useDotenv: true,
        provider: {
          stage: "${env:FOO, 'dev'}",
        },
      },
    });
    await fsp.writeFile(path.resolve(serviceDir, '.env'), 'FOO=test');
    try {
      await spawn('node', [serverlessPath, 'print'], { cwd: serviceDir });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('Environment variable "FOO" which');
    }
  });

  it('should reject unresolved "plugins" property', async () => {
    try {
      await spawn('node', [serverlessPath, 'print'], {
        cwd: (
          await programmaticFixturesEngine.setup('aws', {
            configExt: { plugins: '${foo:bar}' },
          })
        ).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('"plugins" property is not accessible');
    }
  });

  it('should throw meaningful error on unrecognized command for custom provider', async () => {
    try {
      await spawn('node', [serverlessPath, 'foo'], {
        cwd: (await programmaticFixturesEngine.setup('custom-provider')).servicePath,
      });
      throw new Error('Unexpected');
    } catch (error) {
      if (!error.code) throw error;
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('command "foo" not found');
    }
  });

  it('should show help when requested and in context of invalid service configuration', async () => {
    const output = String(
      (
        await spawn('node', [serverlessPath, '--help'], {
          cwd: path.resolve(programmaticFixturesPath, 'config-invalid'),
        })
      ).stdoutBuffer
    );
    expect(output).to.include('serverless <command> <options>');
  });

  it('should print general --help to stdout', async () => {
    const output = String((await spawn('node', [serverlessPath, '--help'])).stdoutBuffer);
    expect(output).to.include('serverless <command> <options>');
  });

  it('should print command --help to stdout', async () => {
    const output = String((await spawn('node', [serverlessPath, 'deploy', '--help'])).stdoutBuffer);
    expect(output).to.include('deploy');
    expect(output).to.include('stage');
  });

  it('should print not integrated command --help to stdout', async () => {
    const output = String(
      (await spawn('node', [serverlessPath, 'plugin', 'install', '--help'])).stdoutBuffer
    );
    expect(output).to.include('plugin install');
    expect(output).to.include('stage');
  });

  it('should print interactive setup help to stdout', async () => {
    const output = String(
      (await spawn('node', [serverlessPath, '--help-interactive'])).stdoutBuffer
    );
    expect(output).to.include('Interactive CLI');
    expect(output).to.not.include('Main commands');
  });

  it('should show help when running container command', async () => {
    // Note: Arbitrarily picked "plugin" command for testing
    const output = stripAnsi(
      String((await spawn('node', [serverlessPath, 'plugin'])).stdoutBuffer)
    );
    expect(output).to.include('plugin install');
  });

  it('should crash in required option is missing', async () => {
    try {
      await spawn('node', [serverlessPath, 'config', 'credentials', '-k', 'foo', '-s', 'bar']);
      throw new Error('Unexpected');
    } catch (error) {
      expect(error.code).to.equal(1);
      expect(String(error.stdoutBuffer)).to.include('command "config credentials" requires');
    }
  });
});
