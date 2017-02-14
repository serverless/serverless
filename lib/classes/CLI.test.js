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

    beforeEach(() => {
      cli = new CLI(serverless);
      consoleLogStub = sinon.stub(cli, 'consoleLog').returns();
    });

    afterEach(() => {
      cli.consoleLog.restore();
      delete process.env.SLS_IGNORE_WARNING;
    });

    it('should log breaking changes when they are provided', () => {
      const nextVersion = 'Next';

      cli.breakingChanges = [
        'x is broken',
        'y will be updated',
      ];

      let expectedMessage = '\n';
      expectedMessage += chalk.yellow(`  WARNING: You are running v${serverlessVersion}. v${nextVersion} will include the following breaking changes:\n`); //eslint-disable-line
      expectedMessage += chalk.yellow('    - x is broken\n');
      expectedMessage += chalk.yellow('    - y will be updated\n');
      expectedMessage += '\n';
      expectedMessage += chalk.yellow('  You can opt-out from these warnings by setting the "SLS_IGNORE_WARNING=*" environment variable.\n'); //eslint-disable-line

      const message = cli.logBreakingChanges(nextVersion);

      expect(consoleLogStub.calledOnce).to.equal(true);
      expect(message).to.equal(expectedMessage);
    });

    it('should not log breaking changes when they are not provided', () => {
      cli.breakingChanges = [];

      const expectedMessage = '';

      const message = cli.logBreakingChanges();

      expect(consoleLogStub.calledOnce).to.equal(false);
      expect(message).to.equal(expectedMessage);
    });

    it('should not log breaking changes when the "disable environment variable" is set', () => {
      // we have some breaking changes
      cli.breakingChanges = [
        'x is broken',
        'y will be updated',
      ];

      // this should prevent the breaking changes from being logged
      process.env.SLS_IGNORE_WARNING = '*';

      cli.breakingChanges = [];

      const expectedMessage = '';

      const message = cli.logBreakingChanges();

      expect(consoleLogStub.calledOnce).to.equal(false);
      expect(message).to.equal(expectedMessage);
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
