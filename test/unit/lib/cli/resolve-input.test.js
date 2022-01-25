'use strict';

const { expect } = require('chai');
const overrideArgv = require('process-utils/override-argv');
const resolveInput = require('../../../../lib/cli/resolve-input');
const commandsSchema = require('../../../../lib/cli/commands-schema');

describe('test/unit/lib/cli/resolve-input.test.js', () => {
  describe('when commands', () => {
    let data;
    before(() => {
      resolveInput.clear();
      delete require.cache[require.resolve('../../../../lib/utils/log-deprecation')];
      process.env.SLS_DEPRECATION_DISABLE = 'CLI_OPTIONS_BEFORE_COMMAND';
      data = overrideArgv(
        {
          args: [
            'serverless',
            'cmd1',
            'cmd2',
            '--version',
            'ver',
            '--help',
            'h',
            '--config',
            'conf',
            'elo',
            'other',
          ],
        },
        () => resolveInput()
      );
    });

    it('should resolve commands', async () => {
      expect(data.commands).to.deep.equal(['cmd1', 'cmd2']);
    });

    it('should recognize --version as boolean', async () => {
      expect(data.options.version).to.equal(true);
    });

    it('should recognize --help as boolean', async () => {
      expect(data.options.help).to.equal(true);
    });

    it('should recognize --config', async () => {
      expect(data.options.config).to.equal('conf');
    });
  });

  describe('"-s" handling', () => {
    describe('Normal command', () => {
      let data;
      before(() => {
        resolveInput.clear();
        data = overrideArgv(
          {
            args: ['serverless', 'package', '-s', 'stage'],
          },
          () => resolveInput()
        );
      });
      it('should recognize stage alias', async () => {
        expect(data.options.stage).to.equal('stage');
      });
    });
    describe('Command with custom -s alias', () => {
      let data;
      before(() => {
        resolveInput.clear();
        data = overrideArgv(
          {
            args: ['serverless', 'config', 'credentials', '-s', 'stage'],
          },
          () => resolveInput()
        );
      });
      it('should recognize stage alias', async () => {
        expect(data.options).to.not.have.property('stage');
      });
    });
  });

  describe('when no commands', () => {
    let data;
    before(() => {
      resolveInput.clear();
      data = overrideArgv(
        {
          args: ['serverless', '-v', '-h', '-c', 'conf'],
        },
        () => resolveInput()
      );
    });

    it('should resolve empty commands list', async () => {
      expect(data.commands).to.deep.equal([]);
    });

    it('should recognize -v as --version alias', async () => {
      expect(data.options.version).to.equal(true);
    });

    it('should recognize --h alias', async () => {
      expect(data.options.help).to.equal(true);
    });

    it('should recognize --c alias', async () => {
      expect(data.options.config).to.equal('conf');
    });

    it('should recognize --version', async () => {
      resolveInput.clear();
      data = overrideArgv(
        {
          args: ['serverless', '--version'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get(''),
        command: '',
        commands: [],
        options: { version: true },
        isHelpRequest: true,
        commandsSchema,
      });
    });

    it('should recognize interactive setup', async () => {
      resolveInput.clear();
      data = overrideArgv(
        {
          args: ['serverless', '--app', 'foo'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get(''),
        command: '',
        commands: [],
        options: { app: 'foo' },
        commandsSchema,
      });
    });
  });

  describe('isHelpRequest', () => {
    it('should not mark regular command', async () => {
      resolveInput.clear();
      const data = overrideArgv(
        {
          args: ['serverless', 'package'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get('package'),
        command: 'package',
        commands: ['package'],
        options: {},
        commandsSchema,
      });
    });

    it('should recognize "--help"', async () => {
      resolveInput.clear();
      const data = overrideArgv(
        {
          args: ['serverless', '--help'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get(''),
        command: '',
        commands: [],
        options: { help: true },
        isHelpRequest: true,
        commandsSchema,
      });
    });

    it('should recognize command "--help"', async () => {
      resolveInput.clear();
      const data = overrideArgv(
        {
          args: ['serverless', 'package', '--help'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get('package'),
        command: 'package',
        commands: ['package'],
        options: { help: true },
        isHelpRequest: true,
        commandsSchema,
      });
    });

    it('should recognize "--help-interactive"', async () => {
      resolveInput.clear();
      const data = overrideArgv(
        {
          args: ['serverless', '--help-interactive'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get(''),
        command: '',
        commands: [],
        options: { 'help-interactive': true },
        isHelpRequest: true,
        commandsSchema,
      });
    });

    it('should recognize "help" command', async () => {
      resolveInput.clear();
      const data = overrideArgv(
        {
          args: ['serverless', 'help'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get('help'),
        command: 'help',
        commands: ['help'],
        options: {},
        isHelpRequest: true,
        commandsSchema,
      });
    });
  });

  describe('multiple handling', () => {
    let data;
    before(() => {
      resolveInput.clear();
      data = overrideArgv(
        {
          args: ['serverless', 'invoke', 'local', '--env', 'foo=bar', '--env', 'bar=baz'],
        },
        () => resolveInput()
      );
    });

    it('should recognize multiple env options', async () => {
      expect(data).to.deep.equal({
        commandSchema: commandsSchema.get('invoke local'),
        command: 'invoke local',
        commands: ['invoke', 'local'],
        options: { env: ['foo=bar', 'bar=baz'] },
        commandsSchema,
      });
    });
  });
});
