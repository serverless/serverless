'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const runServerless = require('../../../test/utils/run-serverless');
const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');

const os = require('os');
const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const configUtils = require('@serverless/utils/config');
const promptDisabledConfigPropertyName = require('../../utils/tabCompletion/promptDisabledConfigPropertyName');
const isTabCompletionSupported = require('../../utils/tabCompletion/isSupported');
const inquirer = require('@serverless/utils/inquirer');

const lifecycleHookNamesBlacklist = [
  'before:interactiveCli:setupAws',
  'interactiveCli:initializeService',
  'interactiveCli:setupAws',
  'interactiveCli:autoUpdate',
];

BbPromise.promisifyAll(fs);

describe('interactiveCli: tabCompletion', () => {
  let backupIsTTY;

  before(() => {
    backupIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
  });
  after(() => {
    process.stdin.isTTY = backupIsTTY;
  });

  afterEach(() => {
    configUtils.set(promptDisabledConfigPropertyName, false);
    sinon.restore();
  });

  if (!isTabCompletionSupported) {
    it('Should not suggest tab completion setup in non supported environments', () => {
      return runServerless({
        cwd: os.homedir(),
        lifecycleHookNamesBlacklist,
      });
    });
    return;
  }

  it('Should abort if user does not want to setup tab completion', () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupTabCompletion: false },
    });
    return runServerless({
      cwd: os.homedir(),
      lifecycleHookNamesBlacklist,
    });
  });

  it('Should not prompt again is user opt out from setup', () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupTabCompletion: false },
    });
    return runServerless({
      cwd: os.homedir(),
      lifecycleHookNamesBlacklist,
    }).then(() => {
      inquirer.prompt.restore();
      return runServerless({
        cwd: os.homedir(),
        lifecycleHookNamesBlacklist,
      });
    });
  });

  it('Should setup tab completion on user request', () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupTabCompletion: true, locationOK: true },
      list: { shell: 'bash' },
    });
    return runServerless({
      cwd: os.homedir(),
      env: { SHELL: 'bash' },
      lifecycleHookNamesBlacklist,
    }).then(() =>
      Promise.all([
        fs
          .readFileAsync(path.resolve(os.homedir(), '.bashrc'), 'utf8')
          .then(bashRcContent =>
            expect(bashRcContent).to.include(' ~/.config/tabtab/__tabtab.bash')
          ),
        fs.readFileAsync(path.resolve(os.homedir(), '.config/tabtab/serverless.bash'), 'utf8'),
        fs.readFileAsync(path.resolve(os.homedir(), '.config/tabtab/sls.bash'), 'utf8'),
      ])
    );
  });
});
