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
      expect(data.options.version).to.equal(true);
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
  });
});
