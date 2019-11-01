'use strict';

const chai = require('chai');
const sinon = require('sinon');
const CLI = require('../../lib/classes/CLI');
const fse = require('fs-extra');
const spawn = require('child-process-ext/spawn');
const resolveAwsEnv = require('@serverless/test/resolve-env');
const stripAnsi = require('strip-ansi');
const Serverless = require('../../lib/Serverless');
const { getTmpDirPath } = require('../../tests/utils/fs');

const { expect } = chai;
chai.use(require('sinon-chai'));

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
              lifecycleEvents: ['test'],
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
                  lifecycleEvents: ['test'],
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
              lifecycleEvents: ['test'],
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
              lifecycleEvents: ['test'],
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
                  lifecycleEvents: ['test'],
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
              lifecycleEvents: ['test'],
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
      getCommandsStub = sinon.stub(cli.serverless.pluginManager, 'getCommands').returns(commands);
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
      expect(displayCommandUsageStub.calledWithExactly(commands.package, 'package')).to.equal(true);
      expect(displayCommandOptionsStub.calledOnce).to.equal(true);
      expect(displayCommandOptionsStub.calledWithExactly(commands.package)).to.equal(true);
    });

    it('should throw an error if the command could not be found', () => {
      const commandsArray = ['invalid-command'];

      cli.inputArray = commandsArray;

      expect(() => {
        cli.generateCommandsHelp(commandsArray);
      }).to.throw(Error, 'not found');
      expect(getCommandsStub.calledOnce).to.equal(true);
      expect(consoleLogStub.called).to.equal(false);
      expect(displayCommandUsageStub.calledOnce).to.equal(false);
      expect(displayCommandOptionsStub.calledOnce).to.equal(false);
    });
  });

  describe('#getVersionNumber()', () => {
    let consoleLogSpy;

    beforeEach(() => {
      cli = new CLI(serverless);
      consoleLogSpy = sinon.spy(cli, 'consoleLog');
    });

    afterEach(() => {
      cli.consoleLog.restore();
    });

    it('should log the version numbers', () => {
      cli.getVersionNumber();

      expect(consoleLogSpy.args[0][0]).to.include('Framework Core');
      expect(consoleLogSpy.args[0][0]).to.include('Plugin');
      expect(consoleLogSpy.args[0][0]).to.include('SDK');

      const userNodeVersion = Number(process.version.split('.')[0].slice(1));
      if (userNodeVersion >= 8) {
        expect(consoleLogSpy.args[1][0]).to.include('Components Core');
        expect(consoleLogSpy.args[1][0]).to.include('Components CLI');
      }
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

  describe('#displayCommandUsage', () => {
    let consoleLogStub;
    const mycommand = {
      type: 'container',
      commands: {
        subcmd: {
          usage: 'Subcmd usage',
          lifecycleEvents: ['event1', 'event2'],
        },
      },
    };

    beforeEach(() => {
      cli = new CLI(serverless);
      consoleLogStub = sinon.stub(cli, 'consoleLog').returns();
    });

    afterEach(() => {
      cli.consoleLog.restore();
    });

    it('should not display container command', () => {
      cli.displayCommandUsage(mycommand, 'mycommand');

      expect(consoleLogStub.calledWith(sinon.match('mycommand .'))).to.equal(false);
    });

    it('should display container subcommand', () => {
      cli.displayCommandUsage(mycommand, 'mycommand');
      expect(stripAnsi(consoleLogStub.firstCall.args[0]).startsWith('mycommand subcmd .')).to.equal(
        true
      );
    });
  });

  describe('#log', () => {
    let consoleLogSpy;

    beforeEach(() => {
      cli = new CLI(serverless);
      consoleLogSpy = sinon.spy(cli, 'consoleLog');
    });

    afterEach(() => {
      cli.consoleLog.restore();
    });

    it('should log messages', () => {
      const msg = 'Hello World!';

      cli.log(msg);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Serverless: Hello World!');
    });

    it('should support different entities', () => {
      const msg = 'Hello World!';
      const entity = 'Entity';

      cli.log(msg, entity);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Entity: Hello World!');
    });

    // NOTE: Here we're just testing that it won't break
    it('should support logging options', () => {
      const msg = 'Hello World!';
      const opts = {
        color: 'orange',
        bold: true,
        underline: true,
      };

      cli.log(msg, 'Serverless', opts);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Serverless: Hello World!');
    });

    it('should ignore invalid logging options', () => {
      const msg = 'Hello World!';
      const opts = {
        invalid: 'option',
      };

      cli.log(msg, 'Serverless', opts);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Serverless: Hello World!');
    });
  });

  describe('Integration tests', function() {
    this.timeout(1000 * 60 * 10);
    const that = this;
    const serverlessExec = require('../../tests/serverless-binary');
    const env = resolveAwsEnv();

    before(() => {
      const tmpDir = getTmpDirPath();

      that.cwd = process.cwd();

      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
    });

    after(() => {
      process.chdir(that.cwd);
    });

    it('should print general --help to stdout', () =>
      spawn(serverlessExec, ['--help'], { env }).then(({ stdoutBuffer }) =>
        expect(String(stdoutBuffer)).to.contain('contextual help')
      ));

    it('should print command --help to stdout', () =>
      spawn(serverlessExec, ['deploy', '--help'], { env }).then(({ stdoutBuffer }) => {
        const stdout = String(stdoutBuffer);
        expect(stdout).to.contain('deploy');
        expect(stdout).to.contain('--stage');
      }));

    it('should print help --verbose to stdout', () =>
      spawn(serverlessExec, ['help', '--verbose'], { env }).then(({ stdoutBuffer }) =>
        expect(String(stdoutBuffer)).to.contain('Commands by plugin')
      ));
  });
});
