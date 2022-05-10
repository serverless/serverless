'use strict';

const chai = require('chai');
chai.use(require('chai-as-promised'));

const { expect } = chai;

const path = require('path');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const overrideArgv = require('process-utils/override-argv');
const overrideEnv = require('process-utils/override-env');
const requireUncached = require('ncjsm/require-uncached');
const resolveServerlessConfigPath = require('../../../../lib/cli/resolve-configuration-path');
const resolveInput = require('../../../../lib/cli/resolve-input');

describe('test/unit/lib/cli/resolve-configuration-path.test.js', () => {
  let configurationPath;
  afterEach(async () => {
    if (!configurationPath) return;
    try {
      await fsp.unlink(configurationPath);
    } catch {
      // Ignore any error
    }
  });

  it('should not resolve a path in not a service context', async () => {
    expect(await resolveServerlessConfigPath()).to.equal(null);
  });

  it('should recognize "serverless.yml"', async () => {
    configurationPath = path.resolve('serverless.yml');
    await fse.ensureFile(configurationPath);
    expect(await resolveServerlessConfigPath()).to.equal(configurationPath);
  });

  it('should recognize "serverless.yaml"', async () => {
    configurationPath = path.resolve('serverless.yaml');
    await fse.ensureFile(configurationPath);
    expect(await resolveServerlessConfigPath()).to.equal(configurationPath);
  });

  it('should recognize "serverless.json"', async () => {
    configurationPath = path.resolve('serverless.json');
    await fse.ensureFile(configurationPath);
    expect(await resolveServerlessConfigPath()).to.equal(configurationPath);
  });

  it('should recognize "serverless.js"', async () => {
    configurationPath = path.resolve('serverless.js');
    await fse.ensureFile(configurationPath);
    expect(await resolveServerlessConfigPath()).to.equal(configurationPath);
  });

  it('should recognize "serverless.ts"', async () => {
    configurationPath = path.resolve('serverless.ts');
    await fse.ensureFile(configurationPath);
    expect(await resolveServerlessConfigPath()).to.equal(configurationPath);
  });

  describe('"--config" param support', () => {
    before(async () =>
      Promise.all([
        fse.ensureFile(path.resolve('custom.yml')),
        fse.ensureFile(path.resolve('nested/custom.yml')),
        fse.ensureFile(path.resolve('custom.foo')),
        fse.ensureDir(path.resolve('custom-dir.yml')),
      ])
    );
    beforeEach(() => {
      resolveInput.clear();
    });

    it('should accept absolute path, pointing configuration in current working directory', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', path.resolve('custom.yml')],
        },
        async () => expect(await resolveServerlessConfigPath()).to.equal(path.resolve('custom.yml'))
      );
    });

    it('should temporarily support nested path', async () => {
      await overrideEnv(async () => {
        process.env.SLS_DEPRECATION_NOTIFICATION_MODE = 'warn';
        const uncached = requireUncached(() => ({
          resolveServerlessConfigPath: require('../../../../lib/cli/resolve-configuration-path'),
        }));
        await overrideArgv(
          {
            args: ['serverless', '--config', 'nested/custom.yml'],
          },
          async () => {
            await expect(
              uncached.resolveServerlessConfigPath()
            ).to.eventually.be.rejected.and.have.property(
              'code',
              'NESTED_CUSTOM_CONFIGURATION_PATH'
            );
          }
        );
      });
    });
    it('should reject unsupported extension', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'custom.foo'],
        },
        () =>
          expect(resolveServerlessConfigPath()).to.eventually.be.rejected.and.have.property(
            'code',
            'INVALID_SERVICE_CONFIG_PATH'
          )
      );
    });
    it('should reject not existing file', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'not-existing.yml'],
        },
        () =>
          expect(resolveServerlessConfigPath()).to.eventually.be.rejected.and.have.property(
            'code',
            'INVALID_SERVICE_CONFIG_PATH'
          )
      );
    });
    it('should reject directory', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'custom-dir.yml'],
        },
        () =>
          expect(resolveServerlessConfigPath()).to.eventually.be.rejected.and.have.property(
            'code',
            'INVALID_SERVICE_CONFIG_PATH'
          )
      );
    });
    it('should recognize top level file with supported extension', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'custom.yml'],
        },
        async () => expect(await resolveServerlessConfigPath()).to.equal(path.resolve('custom.yml'))
      );
    });
    it('should recognize "param=value" format', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config=custom.yml'],
        },
        async () => expect(await resolveServerlessConfigPath()).to.equal(path.resolve('custom.yml'))
      );
    });
  });

  describe('options support', () => {
    before(async () =>
      Promise.all([
        fse.ensureFile(path.resolve('custom/custom.yml')),
        fse.ensureFile(path.resolve('normal/serverless.yml')),
      ])
    );
    beforeEach(() => {
      resolveInput.clear();
    });

    it('should support custom cwd', async () => {
      expect(await resolveServerlessConfigPath({ cwd: 'normal' })).to.equal(
        path.resolve('normal/serverless.yml')
      );
    });
    it('should support custom cli options', async () => {
      expect(
        await resolveServerlessConfigPath({ cwd: 'custom', options: { config: 'custom.yml' } })
      ).to.equal(path.resolve('custom/custom.yml'));
    });
  });
});
