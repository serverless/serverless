'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const runServerless = require('../../../test/utils/run-serverless');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');

const fs = require('fs');
const BbPromise = require('bluebird');
const configUtils = require('@serverless/utils/config');
const inquirer = require('@serverless/utils/inquirer');

const lifecycleHookNamesBlacklist = [
  'before:interactiveCli:setupAws',
  'interactiveCli:initializeService',
  'interactiveCli:setupAws',
  'interactiveCli:tabCompletion',
];

BbPromise.promisifyAll(fs);

const modulesCacheStub = {
  './lib/utils/npmPackage/isGlobal.js': async () => true,
  './lib/utils/npmPackage/isWritable.js': async () => true,
  '@serverless/utils/inquirer': inquirer,
};

describe('interactiveCli: autoUpdate', () => {
  let backupIsTTY;

  before(() => {
    backupIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
  });
  after(() => {
    process.stdin.isTTY = backupIsTTY;
  });

  afterEach(() => {
    configUtils.set('autoUpdate.isInteractiveSetupPromptDisabled', false);
    sinon.restore();
  });

  it('Should not suggest auto update in non supported environments', async () => {
    await runServerless({
      noService: true,
      lifecycleHookNamesBlacklist,
      modulesCacheStub: {
        ...modulesCacheStub,
        './lib/utils/npmPackage/isGlobal.js': async () => false,
      },
    });
    expect(configUtils.get('autoUpdate.enabled')).to.be.undefined;
    await runServerless({
      noService: true,
      lifecycleHookNamesBlacklist,
      modulesCacheStub: {
        ...modulesCacheStub,
        './lib/utils/npmPackage/isWritable.js': async () => false,
      },
    });
    expect(configUtils.get('autoUpdate.enabled')).to.be.undefined;
  });

  it('Should abort if user does not want to setup auto update', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupAutoUpdate: false },
    });
    await runServerless({
      noService: true,
      lifecycleHookNamesBlacklist,
      modulesCacheStub,
    });
    expect(configUtils.get('autoUpdate.enabled')).to.be.undefined;
  });

  it('Should not prompt again is user opt out from setup', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupAutoUpdate: false },
    });
    await runServerless({
      noService: true,
      lifecycleHookNamesBlacklist,
      modulesCacheStub,
    });
    expect(configUtils.get('autoUpdate.enabled')).to.be.undefined;
    inquirer.prompt.restore();
    await runServerless({
      noService: true,
      lifecycleHookNamesBlacklist,
      modulesCacheStub: {
        './lib/utils/npmPackage/isGlobal.js': async () => true,
        './lib/utils/npmPackage/isWritable.js': async () => true,
      },
    });
    expect(configUtils.get('autoUpdate.enabled')).to.be.undefined;
  });

  it('Should setup tab completion on user request', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupAutoUpdate: true },
    });
    await runServerless({
      noService: true,
      lifecycleHookNamesBlacklist,
      modulesCacheStub,
    });
    expect(configUtils.get('autoUpdate.enabled')).to.be.true;
  });
});
