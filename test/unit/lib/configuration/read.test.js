'use strict';

const chai = require('chai');
chai.use(require('chai-as-promised'));

const { expect } = chai;

const fsp = require('fs').promises;
const fse = require('fs-extra');
const proxyquire = require('proxyquire');
const readConfiguration = require('../../../../lib/configuration/read');

describe('test/unit/lib/configuration/read.test.js', () => {
  let configurationPath;

  afterEach(async () => {
    if (configurationPath) await fsp.unlink(configurationPath);
    configurationPath = null;
  });

  it('should read "serverless.yml"', async () => {
    configurationPath = 'serverless.yml';
    await fsp.writeFile(configurationPath, 'service: test-yml\nprovider:\n  name: aws\n');
    expect(await readConfiguration(configurationPath)).to.deep.equal({
      service: 'test-yml',
      provider: { name: 'aws' },
    });
  });

  it('should read "serverless.yaml"', async () => {
    configurationPath = 'serverless.yaml';
    await fsp.writeFile(configurationPath, 'service: test-yaml\nprovider:\n  name: aws\n');
    expect(await readConfiguration(configurationPath)).to.deep.equal({
      service: 'test-yaml',
      provider: { name: 'aws' },
    });
  });

  it('should support AWS CloudFormation shortcut syntax', async () => {
    configurationPath = 'serverless.yml';
    await fsp.writeFile(
      configurationPath,
      'service: test-cf-shortcut\nprovider:\n  name: aws\n  cfProperty: !GetAtt MyResource.Arn'
    );
    expect(await readConfiguration(configurationPath)).to.deep.equal({
      service: 'test-cf-shortcut',
      provider: { name: 'aws', cfProperty: { 'Fn::GetAtt': ['MyResource', 'Arn'] } },
    });
  });

  it('should read "serverless.json"', async () => {
    configurationPath = 'serverless.json';
    const configuration = {
      service: 'test-json',
      provider: { name: 'aws' },
    };
    await fsp.writeFile(configurationPath, JSON.stringify(configuration));
    expect(await readConfiguration(configurationPath)).to.deep.equal(configuration);
  });

  it('should read "serverless.js"', async () => {
    configurationPath = 'serverless.js';
    const configuration = {
      service: 'test-js',
      provider: { name: 'aws' },
    };
    await fsp.writeFile(configurationPath, `module.exports = ${JSON.stringify(configuration)}`);
    expect(await readConfiguration(configurationPath)).to.deep.equal(configuration);
  });

  it('should read "serverless.ts"', async () => {
    await fse.ensureDir('node_modules');
    try {
      await fsp.writeFile('node_modules/ts-node.js', 'module.exports.register = () => null;');
      configurationPath = 'serverless.ts';
      const configuration = {
        service: 'test-ts',
        provider: { name: 'aws' },
      };
      await fsp.writeFile(configurationPath, `module.exports = ${JSON.stringify(configuration)}`);
      expect(await readConfiguration(configurationPath)).to.deep.equal(configuration);
    } finally {
      await fse.remove('node_modules');
    }
  });

  it('should register ts-node only if it is not already registered', async () => {
    try {
      expect(process[Symbol.for('ts-node.register.instance')]).to.be.undefined;
      process[Symbol.for('ts-node.register.instance')] = 'foo';
      configurationPath = 'serverless.ts';
      const configuration = {
        service: 'test-ts',
        provider: { name: 'aws' },
      };
      await fsp.writeFile(configurationPath, `module.exports = ${JSON.stringify(configuration)}`);
      expect(await readConfiguration(configurationPath)).to.deep.equal(configuration);
    } finally {
      delete process[Symbol.for('ts-node.register.instance')];
    }
  });

  it('should support deferred configuration result', async () => {
    // JS configurations are required (so immune to modules caching).
    // In this tests we cannot use same JS configuration path twice for testing
    configurationPath = 'serverless-deferred.js';
    const configuration = {
      service: 'test-deferred',
      provider: { name: 'aws' },
    };
    await fsp.writeFile(
      configurationPath,
      `module.exports = Promise.resolve(${JSON.stringify(configuration)})`
    );
    expect(await readConfiguration(configurationPath)).to.deep.equal(configuration);
  });

  it('should reject not existing file', async () => {
    await expect(readConfiguration('serverless.yml')).to.eventually.be.rejected.and.have.property(
      'code',
      'CONFIGURATION_NOT_FOUND'
    );
  });

  it('should reject unknown type', async () => {
    configurationPath = 'serverless.foo';

    await fse.ensureFile(configurationPath);
    await expect(readConfiguration(configurationPath)).to.eventually.be.rejected.and.have.property(
      'code',
      'UNSUPPORTED_CONFIGURATION_TYPE'
    );
  });

  it('should reject YAML syntax error', async () => {
    configurationPath = 'serverless.yaml';
    await fsp.writeFile(configurationPath, 'service: test-yaml\np [\nr\novider:\n  name: aws\n');
    await expect(readConfiguration(configurationPath)).to.eventually.be.rejected.and.have.property(
      'code',
      'CONFIGURATION_PARSE_ERROR'
    );
  });

  it('should reject JSON syntax error', async () => {
    configurationPath = 'serverless.json';
    await fsp.writeFile(configurationPath, '{foom,sdfs}');
    await expect(readConfiguration(configurationPath)).to.eventually.be.rejected.and.have.property(
      'code',
      'CONFIGURATION_PARSE_ERROR'
    );
  });

  it('should reject JS intialization error', async () => {
    configurationPath = 'serverless-errored.js';
    await fsp.writeFile(configurationPath, 'throw new Error("Stop!")');
    await expect(readConfiguration(configurationPath)).to.eventually.be.rejected.and.have.property(
      'code',
      'CONFIGURATION_INITIALIZATION_ERROR'
    );
  });

  it('should reject TS configuration if "ts-node" is not found', async () => {
    // Test against different service dir, to not fall into cached `require.resolve` value
    configurationPath = 'other/serverless-errored.ts';
    const configuration = {
      service: 'test-ts',
      provider: { name: 'aws' },
    };
    await fse.ensureFile(configurationPath);
    await fsp.writeFile(configurationPath, `module.exports = ${JSON.stringify(configuration)}`);
    await expect(
      proxyquire('../../../../lib/configuration/read', {
        'child-process-ext/spawn': async () => {
          throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
        },
      })(configurationPath)
    ).to.eventually.be.rejected.and.have.property('code', 'CONFIGURATION_RESOLUTION_ERROR');
  });

  it('should reject non object configuration', async () => {
    configurationPath = 'serverless.json';
    await fsp.writeFile(configurationPath, JSON.stringify([]));
    await expect(readConfiguration(configurationPath)).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_CONFIGURATION_EXPORT'
    );
  });
  it('should reject non JSON like structures', async () => {
    configurationPath = 'serverless-custom.js';
    await fsp.writeFile(configurationPath, 'exports.foo = exports');
    await expect(readConfiguration(configurationPath)).to.eventually.be.rejected.and.have.property(
      'code',
      'INVALID_CONFIGURATION_STRUCTURE'
    );
  });
});
