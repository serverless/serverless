'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');
const configUtils = require('@serverless/utils/config');
const inquirer = require('@serverless/utils/inquirer');
const step = require('../../../../../lib/cli/interactive-setup/auto-update');

describe('test/unit/lib/cli/interactive-setup/auto-update.test.js', () => {
  afterEach(() => {
    configUtils.set('autoUpdate.isInteractiveSetupPromptDisabled', false);
    sinon.restore();
  });

  it('Should not suggest auto update in non supported environments', async () => {
    let uncachedStep = proxyquire('../../../../../lib/cli/interactive-setup/auto-update', {
      '../../utils/isStandaloneExecutable': false,
      '../../utils/is-locally-installed': async () => true,
      '../../utils/npmPackage/isGlobal': async () => true,
      '../../utils/npmPackage/isWritable': async () => true,
    });
    expect(await uncachedStep.isApplicable({})).to.equal(false);
    uncachedStep = proxyquire('../../../../../lib/cli/interactive-setup/auto-update', {
      '../../utils/isStandaloneExecutable': false,
      '../../utils/is-locally-installed': async () => false,
      '../../utils/npmPackage/isGlobal': async () => false,
      '../../utils/npmPackage/isWritable': async () => true,
    });
    expect(await uncachedStep.isApplicable({})).to.equal(false);
    uncachedStep = proxyquire('../../../../../lib/cli/interactive-setup/auto-update', {
      '../../utils/isStandaloneExecutable': false,
      '../../utils/is-locally-installed': async () => false,
      '../../utils/npmPackage/isGlobal': async () => true,
      '../../utils/npmPackage/isWritable': async () => false,
    });
    expect(await uncachedStep.isApplicable({})).to.equal(false);
  });

  it('Should abort if user does not want to setup auto update', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupAutoUpdate: false },
    });
    await step.run({});
    expect(configUtils.get('autoUpdate.enabled')).to.be.undefined;
    expect(configUtils.get('autoUpdate.isInteractiveSetupPromptDisabled')).to.be.true;
  });

  it('Should not prompt again is user opt out from setup', async () => {
    configUtils.set('autoUpdate.isInteractiveSetupPromptDisabled', true);
    const uncachedStep = proxyquire('../../../../../lib/cli/interactive-setup/auto-update', {
      '../../utils/isStandaloneExecutable': false,
      '../../utils/is-locally-installed': async () => false,
      '../../utils/npmPackage/isGlobal': async () => true,
      '../../utils/npmPackage/isWritable': async () => true,
    });
    expect(await uncachedStep.isApplicable({})).to.equal(false);
  });

  it('Should setup auto update on user request', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupAutoUpdate: true },
    });
    await step.run({});
    expect(configUtils.get('autoUpdate.enabled')).to.be.true;
  });
});
