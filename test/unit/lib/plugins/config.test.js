'use strict';

const fs = require('fs');
const BbPromise = require('bluebird');
const { expect } = require('chai');
const config = require('@serverless/utils/config');
const runServerless = require('../../../utils/run-serverless');

BbPromise.promisifyAll(fs);

describe('Config', () => {
  it('should support "config credentials" command', () =>
    runServerless({
      noService: true,
      command: 'config credentials',
      options: { provider: 'aws', key: 'foo', secret: 'bar' },
    }));

  it('should turn on autoupdate with "--autoupdate"', async () => {
    await runServerless({
      cwd: require('os').homedir(),
      command: 'config',
      options: { autoupdate: true },
      modulesCacheStub: {
        './lib/utils/npm-package/is-global.js': async () => true,
        './lib/utils/npm-package/is-writable.js': async () => true,
      },
    });
    expect(config.get('autoUpdate.enabled')).to.be.true;
  });
  it('should turn off autoupdate with "--no-autoupdate"', async () => {
    await runServerless({
      cwd: __dirname,
      command: 'config',
      options: { autoupdate: false },
    });
    expect(config.get('autoUpdate.enabled')).to.be.false;
  });
});
