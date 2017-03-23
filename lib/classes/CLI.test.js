'use strict';

/**
 * Test: CLI Class
 */

const expect = require('chai').expect;
const CLI = require('../../lib/classes/CLI');
const os = require('os');
const fse = require('fs-extra');
const exec = require('child_process').exec;
const serverlessVersion = require('../../package.json').version;
const path = require('path');
const sinon = require('sinon');
const chalk = require('chalk');
const Serverless = require('../../lib/Serverless');
const testUtils = require('../../tests/utils');

describe('CLI', () => {
  let cli;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({});
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      cli = new CLI(serverless);
      expect(cli.serverless).to.deep.equal(serverless);
    });

    it('should set an empty loadedPlugins array', () => {
      cli = new CLI(serverless);
      expect(cli.loadedPlugins.length).to.equal(0);
    });

    it('should set a null inputArray when none is provided', () =>
        expect(new CLI(serverless).inputArray).to.be.null);

    it('should set the inputObject when provided', () => {
      cli = new CLI(serverless, ['foo', 'bar', '--baz', '-qux']);

      expect(cli.inputArray[0]).to.equal('foo');
      expect(cli.inputArray[1]).to.equal('bar');
      expect(cli.inputArray[2]).to.equal('--baz');
      expect(cli.inputArray[3]).to.equal('-qux');
    });
  });

  describe('#setLoadedPlugins()', () => {
    it('should set the loadedPlugins array with the given plugin instances', () => {
      class PluginMock {}

      const pluginMock = new PluginMock();
      const plugins = [pluginMock];

      cli = new CLI(serverless);

      cli.setLoadedPlugins(plugins);

      expect(cli.loadedPlugins[0]).to.equal(pluginMock);
    });
  });

  describe('#displayHelp()', () => {
    it('should return true when no command is given', () => {
      cli = new CLI(serverless, []);
      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "help" parameter is given', () => {
      cli = new CLI(serverless, ['help']);
      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "--help" parameter is given', () => {
      cli = new CLI(serverless, ['--help']);

      class PluginMock {
        constructor() {
          this.commands = {
            test: {
              usage: 'test',
              lifecycleEvents: [
                'test',
              ],
              options: {
                name: {
                  usage: 'test',
                },
                provider: {
                  usage: 'test',
                },
              },
              commands: {
                test: {
                  usage: 'test',
                  lifecycleEvents: [
                    'test',
                  ],
                  options: {
                    name: {
                      usage: 'test',
                    },
                    provider: {
                      usage: 'test',
                    },
                  },
                },
              },
            },
          };
        }
      }
      serverless.pluginManager.addPlugin(PluginMock);

      cli.setLoadedPlugins(serverless.pluginManager.getPlugins());
      cli.setLoadedCommands(serverless.pluginManager.getCommands());

      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "-h" parameter is given', () => {
      cli = new CLI(serverless, ['-h']);
      const processedInput = cli.processInput();

      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "version" parameter is given', () => {
      cli = new CLI(serverless, ['version']);
      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "--version" parameter is given', () => {
      cli = new CLI(serverless, ['--version']);
      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "-v" parameter is given', () => {
      cli = new CLI(serverless, ['-v']);
      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "-h" parameter is given with a command', () => {
      cli = new CLI(serverless, ['test', '-h']);
      class PluginMock {
        constructor() {
          this.commands = {
            test: {
              usage: 'test',
              lifecycleEvents: [
                'test',
              ],
              options: {
                name: {
                  usage: 'test',
                },
                provider: {
                  usage: 'test',
                },
              },
            },
          };
        }
      }
      serverless.pluginManager.addPlugin(PluginMock);

      cli.setLoadedPlugins(serverless.pluginManager.getPlugins());
      cli.setLoadedCommands(serverless.pluginManager.getCommands());

      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "-h" parameter is given with a deep command', () => {
      cli = new CLI(serverless, ['test', 'test', '-h']);
      class PluginMock {
        constructor() {
          this.commands = {
            test: {
              usage: 'test',
              lifecycleEvents: [
                'test',
              ],
              options: {
                name: {
                  usage: 'test',
                },
                provider: {
                  usage: 'test',
                },
              },
              commands: {
                test: {
                  usage: 'test',
                  lifecycleEvents: [
                    'test',
                  ],
                  options: {
                    name: {
                      usage: 'test',
                    },
                    provider: {
                      usage: 'test',
                    },
                  },
                },
              },
            },
          };
        }
      }
      serverless.pluginManager.addPlugin(PluginMock);

      cli.setLoadedPlugins(serverless.pluginManager.getPlugins());
      cli.setLoadedCommands(serverless.pluginManager.getCommands());

      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(true);
    });

    it('should return false if no "help" or "version" related command / option is given', () => {
      cli = new CLI(serverless, ['test']);
      class PluginMock {
        constructor() {
          this.commands = {
            test: {
              usage: 'test',
              lifecycleEvents: [
                'test',
              ],
              options: {
                name: {
                  usage: 'test',
                },
              },
            },
          };
        }
      }
      serverless.pluginManager.addPlugin(PluginMock);

      cli.setLoadedPlugins(serverless.pluginManager.getPlugins());
      cli.setLoadedCommands(serverless.pluginManager.getCommands());

      const processedInput = cli.processInput();
      const helpDisplayed = cli.displayHelp(processedInput);

      expect(helpDisplayed).to.equal(false);
    });
  });

  describe('#processInput()', () => {
    it('should only return the commands when only commands are given', () => {
      cli = new CLI(serverless, ['deploy', 'functions']);
      const inputToBeProcessed = cli.processInput();

      const expectedObject = { commands: ['deploy', 'functions'], options: {} };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });

    it('should only return the options when only options are given', () => {
      cli = new CLI(serverless, ['-f', 'function1', '-r', 'resource1']);
      const inputToBeProcessed = cli.processInput();

      const expectedObject = { commands: [], options: { f: 'function1', r: 'resource1' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });

    it('should return commands and options when both are given', () => {
      cli = new CLI(serverless, ['deploy', 'functions', '-f', 'function1']);
      const inputToBeProcessed = cli.processInput();

      const expectedObject = { commands: ['deploy', 'functions'], options: { f: 'function1' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });
  });

  describe('#logBreakingChanges()', () => {
    let consoleLogStub;
    let origIgnoreWarning;

    beforeEach(() => {
      cli = new CLI(serverless);
      consoleLogStub = sinon.stub(cli, 'consoleLog').returns();
      origIgnoreWarning = process.env.SLS_IGNORE_WARNING;
    });

    afterEach(() => {
      cli.consoleLog.restore();
      if (origIgnoreWarning === undefined) {
        delete process.env.SLS_IGNORE_WARNING;
      } else {
        process.env.SLS_IGNORE_WARNING = origIgnoreWarning;
      }
    });

    // Test all possible combinations of provided changes and "ignored" setting
    [
      {
        name: 'should NOT LOG breaking changes when changes are NOT PROVIDED and NOT IGNORED',
        isProvided: false,
        isIgnored: false,
        isLogExpected: false,
      },
      {
        name: 'should NOT LOG breaking changes when changes are NOT PROVIDED and IGNORED',
        isProvided: false,
        isIgnored: true,
        isLogExpected: false,
      },
      {
        name: 'should LOG breaking changes when changes are PROVIDED and NOT IGNORED',
        isProvided: true,
        isIgnored: false,
        isLogExpected: true,
      },
      {
        name: 'should NOT LOG breaking changes when changes are PROVIDED and IGNORED',
        isProvided: true,
        isIgnored: true,
        isLogExpected: false,
      },
    ].forEach((testCase) => {
      it(testCase.name, () => {
        // Stubs
        const nextVersion = 'Next';

        let outMessage = '';
        const currentVersion = chalk.inverse(`v${serverlessVersion}`);
        const nVersion = chalk.inverse(`v${nextVersion}`);
        const breakingChanges = [
          'x is broken',
          'y will be updated',
        ];
        outMessage += '\n';
        outMessage += '------------\n';
        outMessage += chalk.yellow('WARNING: Updating and Breaking Changes\n');
        outMessage += chalk.white(`Current Serverless Version: ${currentVersion}\n`);
        outMessage += chalk.white(`Serverless ${nVersion} will include the following breaking changes:\n`); // eslint-disable-line max-len
        breakingChanges.forEach(breakingChange => {
          outMessage += chalk.dim(`- ${breakingChange}\n`);
        });
        outMessage += '\n';
        outMessage += chalk.yellow('To ignore these warnings set the "SLS_IGNORE_WARNING=*" environment variable.\n'); // eslint-disable-line max-len
        outMessage += '------------';
        outMessage += '\n';

        // Prepare the test environment
        cli.breakingChanges = testCase.isProvided ? breakingChanges : [];

        if (testCase.isIgnored) {
          process.env.SLS_IGNORE_WARNING = '*';
        } else {
          delete process.env.SLS_IGNORE_WARNING;
        }

        // Test expectations
        const expectedResult = testCase.isLogExpected ? outMessage : '';
        const expectedLogCalled = testCase.isLogExpected;

        // Carry the test
        const actualResult = cli.logBreakingChanges(nextVersion);

        expect(actualResult).to.equal(expectedResult);
        expect(consoleLogStub.calledOnce).to.equal(expectedLogCalled);
      });
    });
  });

  describe('Integration tests', function () {
    this.timeout(0);
    const that = this;

    before(() => {
      const tmpDir = testUtils.getTmpDirPath();

      that.cwd = process.cwd();

      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);

      serverless = new Serverless();
      serverless.init();

      // Cannot rely on shebang in severless.js to invoke script using NodeJS on Windows.
      const execPrefix = os.platform() === 'win32' ? 'node ' : '';

      that.serverlessExec = execPrefix + path.join(serverless.config.serverlessPath,
        '..', 'bin', 'serverless');
    });

    after(() => {
      process.chdir(that.cwd);
    });

    it('should print general --help to stdout', (done) => {
      exec(`${this.serverlessExec} --help`, (err, stdout) => {
        if (err) {
          done(err);
          return;
        }

        expect(stdout).to.contain('contextual help');
        done();
      });
    });

    it('should print command --help to stdout', (done) => {
      exec(`${this.serverlessExec} deploy --help`, (err, stdout) => {
        if (err) {
          done(err);
          return;
        }

        expect(stdout).to.contain('deploy');
        expect(stdout).to.contain('--stage');
        done();
      });
    });
  });
});
