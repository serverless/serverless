'use strict';

const chai = require('chai');
const sinon = require('sinon');

const { expect } = chai;

chai.use(require('chai-as-promised'));

const configureInquirerStub = require('@serverless/test/configure-inquirer-stub');

const os = require('os');
const fsp = require('fs').promises;
const path = require('path');
const configUtils = require('@serverless/utils/config');
const promptDisabledConfigPropertyName = require('../../../../../lib/utils/tabCompletion/promptDisabledConfigPropertyName');
const isTabCompletionSupported = require('../../../../../lib/utils/tabCompletion/isSupported');
const step = require('../../../../../lib/cli/interactive-setup/tab-completion');

const inquirer = require('@serverless/utils/inquirer');

describe('test/unit/lib/cli/interactive-setup/tab-completion.test.js', () => {
  before(() => {
    process.env.SHELL = 'bash';
  });
  afterEach(() => {
    configUtils.set(promptDisabledConfigPropertyName, false);
    sinon.restore();
  });

  if (!isTabCompletionSupported) {
    it('Should not suggest tab completion setup in non supported environments', async () => {
      expect(await step.isApplicable({})).to.equal(false);
    });
    return;
  }

  it('Should abort if user does not want to setup tab completion', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupTabCompletion: false },
    });
    await step.run({});
  });

  it('Should not prompt again is user opt out from setup', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupTabCompletion: false, locationOK: true },
      list: { shell: 'bash' },
    });
    await step.run({});
    await expect(fsp.readFile('.bashrc')).to.eventually.be.rejected.and.have.property(
      'code',
      'ENOENT'
    );
  });

  it('Should setup tab completion on user request', async () => {
    configureInquirerStub(inquirer, {
      confirm: { shouldSetupTabCompletion: true, locationOK: true },
      list: { shell: 'bash' },
    });
    await step.run({});
    await Promise.all([
      fsp
        .readFile(path.resolve(os.homedir(), '.bashrc'), 'utf8')
        .then((bashRcContent) =>
          expect(bashRcContent).to.include(' ~/.config/tabtab/__tabtab.bash')
        ),
      fsp.readFile(path.resolve(os.homedir(), '.config/tabtab/serverless.bash'), 'utf8'),
      fsp.readFile(path.resolve(os.homedir(), '.config/tabtab/sls.bash'), 'utf8'),
    ]);
  });
});
