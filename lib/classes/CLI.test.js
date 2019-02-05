'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const CLI = require('../../lib/classes/CLI');
const os = require('os');
const fse = require('fs-extra');
const exec = require('child_process').exec;
const path = require('path');
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

  describe('#processedInput()', () => {
    it('should not parse numeric string as number, but as string', () => {
      cli = new CLI(serverless, ['deploy', '--myint=00123', '--myfloat', '1234567890.1234567890']);
      const processedInput = cli.processInput();

      expect(processedInput).to.deep.equal({
        commands: ['deploy'],
        options: {
          myint: '00123',
          myfloat: '1234567890.1234567890',
        },
      });
    });
  });

  describe('#suppressLogIfPrintCommand()', () => {
    let logStub;
    let consoleLogStub;

    beforeEach(() => {
      logStub = sinon.stub();
      consoleLogStub = sinon.stub();
    });

    it('should do nothing when no command is given', () => {
      cli = new CLI(serverless, []);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      const processedInput = cli.processInput();
      cli.suppressLogIfPrintCommand(processedInput);
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should do nothing when "print" is given with "-h"', () => {
      cli = new CLI(serverless, ['print', '-h']);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      const processedInput = cli.processInput();
      cli.suppressLogIfPrintCommand(processedInput);
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should do nothing when "print" is given with "-help"', () => {
      cli = new CLI(serverless, ['print', '-help']);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      const processedInput = cli.processInput();
      cli.suppressLogIfPrintCommand(processedInput);
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should do nothing when "print" is combined with other command.', () => {
      cli = new CLI(serverless, ['other', 'print']);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      const processedInput = cli.processInput();
      cli.suppressLogIfPrintCommand(processedInput);
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should suppress log when "print" is given', () => {
      cli = new CLI(serverless, ['print', '-myvar', '123']);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      const processedInput = cli.processInput();
      cli.suppressLogIfPrintCommand(processedInput);
      cli.log('NOT LOGGED');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(false);
      expect(consoleLogStub.calledOnce).to.equal(true);
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
      serverless.cli = cli;

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
      serverless.cli = cli;
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
      serverless.cli = cli;
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
      serverless.cli = cli;
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

  describe('#generateCommandsHelp()', () => {
    let getCommandsStub;
    let consoleLogStub;
    let displayCommandUsageStub;
    let displayCommandOptionsStub;

    const commands = {
      package: {
        usage: 'Packages a Serverless service',
        lifecycleEvents: ['cleanup', 'initialize'],
        options: {},
        key: 'package',
        pluginName: 'Package',
      },
      deploy: {
        usage: 'Deploy a Serverless service',
        lifecycleEvents: ['cleanup', 'initialize'],
        options: {},
        key: 'deploy',
        pluginName: 'Deploy',
        commands: {},
      },
    };

    beforeEach(() => {
      cli = new CLI(serverless);
      getCommandsStub = sinon.stub(cli.serverless.pluginManager, 'getCommands')
        .returns(commands);
      consoleLogStub = sinon.stub(cli, 'consoleLog').returns();
      displayCommandUsageStub = sinon.stub(cli, 'displayCommandUsage').returns();
      displayCommandOptionsStub = sinon.stub(cli, 'displayCommandOptions').returns();
    });

    afterEach(() => {
      cli.serverless.pluginManager.getCommands.restore();
      cli.consoleLog.restore();
      cli.displayCommandUsage.restore();
      cli.displayCommandOptions.restore();
    });

    it('should gather and generate the commands help info if the command can be found', () => {
      const commandsArray = ['package'];
      cli.inputArray = commandsArray;

      cli.generateCommandsHelp(commandsArray);

      expect(getCommandsStub.calledOnce).to.equal(true);
      expect(consoleLogStub.called).to.equal(true);
      expect(displayCommandUsageStub.calledOnce).to.equal(true);
      expect(displayCommandUsageStub.calledWithExactly(
        commands.package,
        'package'
      )).to.equal(true);
      expect(displayCommandOptionsStub.calledOnce).to.equal(true);
      expect(displayCommandOptionsStub.calledWithExactly(
        commands.package
      )).to.equal(true);
    });

    it('should throw an error if the command could not be found', () => {
      const commandsArray = ['invalid-command'];

      cli.inputArray = commandsArray;

      expect(() => { cli.generateCommandsHelp(commandsArray); })
        .to.throw(Error, 'not found');
      expect(getCommandsStub.calledOnce).to.equal(true);
      expect(consoleLogStub.called).to.equal(false);
      expect(displayCommandUsageStub.calledOnce).to.equal(false);
      expect(displayCommandOptionsStub.calledOnce).to.equal(false);
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

    it('should only return numbers like strings when numbers are given on options', () => {
      cli = new CLI(serverless, ['-f', 'function1', '-k', 123, '-d', '456.7890']);
      const inputToBeProcessed = cli.processInput();

      const expectedObject = { commands: [], options: { f: 'function1', k: '123', d: '456.7890' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });

    it('should not pass base64 values as options', () => {
      cli = new CLI(serverless, ['--service=foo', 'dynamodb', 'install']);
      const inputToBeProcessed = cli.processInput();

      /* It used to fail with the following diff, failing to convert base64 back,
         and unconverting non-base64 values into binary:
       {
         "commands": [
      -    "ZHluYW1vZGI="
      +    "dynamodb"
           "install"
         ]
         "options": {
      -    "service": "~�"
      +    "service": "foo"
         }
       }
      */
      const expectedObject = { commands: ['dynamodb', 'install'], options: { service: 'foo' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });

    it('should return commands and options when both are given', () => {
      cli = new CLI(serverless, ['deploy', 'functions', '-f', 'function1']);
      const inputToBeProcessed = cli.processInput();

      const expectedObject = { commands: ['deploy', 'functions'], options: { f: 'function1' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
    });

    it('should be able to parse --verbose --stage foobar', () => {
      cli = new CLI(serverless, ['deploy', '--verbose', '--stage', 'foobar']);
      const inputToBeProcessed = cli.processInput();

      const expectedObject = { commands: ['deploy'], options: { verbose: true, stage: 'foobar' } };

      expect(inputToBeProcessed).to.deep.equal(expectedObject);
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

    it('should print help --verbose to stdout', (done) => {
      exec(`${this.serverlessExec} help --verbose`, (err, stdout) => {
        if (err) {
          done(err);
          return;
        }

        expect(stdout).to.contain('Commands by plugin');
        done();
      });
    });
  });
});
