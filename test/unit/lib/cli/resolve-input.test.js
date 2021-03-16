'use strict';

const { expect } = require('chai');
const overrideArgv = require('process-utils/override-argv');
const resolveInput = require('../../../../lib/cli/resolve-input');

describe('test/unit/lib/cli/resolve-input.test.js', () => {
  describe('when commands', () => {
    let data;
    before(() => {
      resolveInput.clear();
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
      expect(data.commands).to.deep.equal(['cmd1', 'cmd2', 'ver', 'h', 'elo', 'other']);
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

    describe('"-v" handling', () => {
      before(() => {
        resolveInput.clear();
        data = overrideArgv(
          {
            args: ['serverless', 'cmd1', 'cmd2', '-v', 'ver', 'other'],
          },
          () => resolveInput()
        );
      });
      it('should not recognize as version alias', async () => {
        expect(data.options).to.not.have.property('version');
      });
      it('should recognize as boolean', async () => {
        expect(data.options.v).to.equal(true);
      });
    });

    describe('Command with initially not recognized boolean', () => {
      before(() => {
        resolveInput.clear();
        data = overrideArgv(
          {
            args: ['serverless', 'deploy', '--force', 'function', '-f', 'foo'],
          },
          () => resolveInput()
        );
      });

      it('should recognize target command', async () => {
        expect(data).to.deep.equal({
          commands: ['deploy', 'function'],
          options: { force: true, function: 'foo' },
        });
      });
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
      expect(data).to.deep.equal({ commands: [], options: { version: true } });
    });

    it('should recognize interactive setup', async () => {
      resolveInput.clear();
      data = overrideArgv(
        {
          args: ['serverless', '--app', 'foo'],
        },
        () => resolveInput()
      );
      expect(data).to.deep.equal({ commands: [], options: { app: 'foo' } });
    });
  });

  describe('"help" command', () => {
    let data;
    before(() => {
      resolveInput.clear();
      data = overrideArgv(
        {
          args: ['serverless', 'help'],
        },
        () => resolveInput()
      );
    });

    it('should recognize', async () => {
      expect(data).to.deep.equal({ commands: ['help'], options: {} });
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
        commands: ['invoke', 'local'],
        options: { env: ['foo=bar', 'bar=baz'] },
      });
    });
  });
});
