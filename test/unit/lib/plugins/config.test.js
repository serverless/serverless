'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const BbPromise = require('bluebird');
const { expect } = require('chai');
const config = require('@serverless/utils/config');
const runServerless = require('../../../utils/run-serverless');
const isTabCompletionSupported = require('../../../../lib/utils/tabCompletion/isSupported');

BbPromise.promisifyAll(fs);

const unexpected = () => {
  throw new Error('Unexpected');
};

describe('Config', () => {
  it('should support "config credentials" command', () =>
    runServerless({
      noService: true,
      command: 'config credentials',
      options: { provider: 'aws', key: 'foo', secret: 'bar' },
    }));

  if (isTabCompletionSupported) {
    it('should support "config tabcompletion install" command', () =>
      runServerless({
        cwd: os.homedir(),
        env: { SHELL: 'bash' },
        command: 'config tabcompletion install',
      }).then(() =>
        Promise.all([
          fs
            .readFileAsync(path.resolve(os.homedir(), '.bashrc'), 'utf8')
            .then((bashRcContent) =>
              expect(bashRcContent).to.include(' ~/.config/tabtab/__tabtab.bash')
            ),
          fs.readFileAsync(path.resolve(os.homedir(), '.config/tabtab/serverless.bash'), 'utf8'),
          fs.readFileAsync(path.resolve(os.homedir(), '.config/tabtab/sls.bash'), 'utf8'),
        ])
      ));

    it('should support "config tabcompletion uninstall" command', () =>
      runServerless({
        cwd: os.homedir(),
        env: { SHELL: 'bash' },
        command: 'config tabcompletion install',
      }).then(() =>
        runServerless({
          cwd: os.homedir(),
          env: { SHELL: 'bash' },
          command: 'config tabcompletion uninstall',
        }).then(() =>
          Promise.all([
            fs
              .readFileAsync(path.resolve(os.homedir(), '.config/tabtab/serverless.bash'))
              .then(unexpected, (error) => expect(error.code).to.equal('ENOENT')),
            fs
              .readFileAsync(path.resolve(os.homedir(), '.config/tabtab/sls.bash'))
              .then(unexpected, (error) => expect(error.code).to.equal('ENOENT')),
          ])
        )
      ));
  }

  it('should turn on autoupdate with "--autoupdate"', async () => {
    await runServerless({
      cwd: require('os').homedir(),
      command: 'config',
      options: { autoupdate: true },
      modulesCacheStub: {
        './lib/utils/npmPackage/isGlobal.js': async () => true,
        './lib/utils/npmPackage/isWritable.js': async () => true,
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
