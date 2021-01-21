'use strict';

const chai = require('chai');
chai.use(require('chai-as-promised'));

const { expect } = chai;

const path = require('path');
const fs = require('fs').promises;
const fse = require('fs-extra');
const overrideArgv = require('process-utils/override-argv');
const ServerlessError = require('../../../../lib/serverless-error');
const resolveServerlessConfigPathSync = require('../../../../lib/legacy/resolve-configuration-path-sync');

describe('test/unit/lib/legacy/resolve-service-config-path-sync.test.js', () => {
  let configurationPath;
  afterEach(async () => {
    if (!configurationPath) return;
    try {
      await fs.unlink(configurationPath);
    } catch {
      // Ignore any error
    }
  });

  it('should not resolve a path in not a service context', () => {
    expect(resolveServerlessConfigPathSync()).to.equal(null);
  });

  it('should recognize "serverless.yml"', async () => {
    configurationPath = path.resolve('serverless.yml');
    await fse.ensureFile(configurationPath);
    expect(resolveServerlessConfigPathSync()).to.equal(configurationPath);
  });

  it('should recognize "serverless.yaml"', async () => {
    configurationPath = path.resolve('serverless.yaml');
    await fse.ensureFile(configurationPath);
    expect(resolveServerlessConfigPathSync()).to.equal(configurationPath);
  });

  it('should recognize "serverless.json"', async () => {
    configurationPath = path.resolve('serverless.json');
    await fse.ensureFile(configurationPath);
    expect(resolveServerlessConfigPathSync()).to.equal(configurationPath);
  });

  it('should recognize "serverless.js"', async () => {
    configurationPath = path.resolve('serverless.js');
    await fse.ensureFile(configurationPath);
    expect(resolveServerlessConfigPathSync()).to.equal(configurationPath);
  });

  it('should recognize "serverless.ts"', async () => {
    configurationPath = path.resolve('serverless.ts');
    await fse.ensureFile(configurationPath);
    expect(resolveServerlessConfigPathSync()).to.equal(configurationPath);
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

    it('should reject absolute path', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', path.resolve('custom.yml')],
        },
        () =>
          expect(resolveServerlessConfigPathSync)
            .to.throw(ServerlessError)
            .with.property('code', 'INVALID_SERVICE_CONFIG_PATH')
      );
    });

    it('should reject nested path', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'nested/custom.yml'],
        },
        () =>
          expect(resolveServerlessConfigPathSync)
            .to.throw(ServerlessError)
            .with.property('code', 'INVALID_SERVICE_CONFIG_PATH')
      );
    });
    it('should reject unsupported extension', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'custom.foo'],
        },
        () =>
          expect(resolveServerlessConfigPathSync)
            .to.throw(ServerlessError)
            .with.property('code', 'INVALID_SERVICE_CONFIG_PATH')
      );
    });
    it('should reject not existing file', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'not-existing.yml'],
        },
        () =>
          expect(resolveServerlessConfigPathSync)
            .to.throw(ServerlessError)
            .with.property('code', 'INVALID_SERVICE_CONFIG_PATH')
      );
    });
    it('should reject directory', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'custom-dir.yml'],
        },
        () =>
          expect(resolveServerlessConfigPathSync)
            .to.throw(ServerlessError)
            .with.property('code', 'INVALID_SERVICE_CONFIG_PATH')
      );
    });
    it('should recognize top level file with supported extension', async () => {
      await overrideArgv(
        {
          args: ['serverless', '--config', 'custom.yml'],
        },
        async () => expect(resolveServerlessConfigPathSync()).to.equal(path.resolve('custom.yml'))
      );
    });
  });
});
