'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const BbPromise = require('bluebird');
const { expect } = require('chai');
const { ServerlessError } = require('../../classes/Error');
const runServerless = require('../../../tests/utils/run-serverless');
const isTabCompletionSupported = require('../../utils/tabCompletion/isSupported');

BbPromise.promisifyAll(fs);

const unexpected = () => {
  throw new Error('Unexpected');
};

describe('Config', () => {
  it('should support "config credentials" command', () =>
    runServerless({
      config: { service: 'foo', provider: 'aws' },
      cliArgs: ['config', 'credentials', '--provider', 'aws', '-k', 'foo', '-s', 'bar'],
      pluginPathsWhitelist: ['./lib/plugins/config/config'],
      lifecycleHookNamesWhitelist: ['before:config:credentials:config'],
    }));

  it('should have a required option "provider" for the "credentials" sub-command', () =>
    runServerless({
      config: { service: 'foo', provider: 'aws' },
      cliArgs: ['config', 'credentials', '-k', 'foo', '-s', 'bar'],
      pluginPathsWhitelist: ['./lib/plugins/config/config'],
      lifecycleHookNamesWhitelist: ['before:config:credentials:config'],
    }).then(unexpected, error => expect(error).to.be.instanceof(ServerlessError)));

  it('should throw an error if user passed unsupported "provider" option', () =>
    runServerless({
      config: { service: 'foo', provider: 'aws' },
      cliArgs: ['config', 'credentials', '--provider', 'not-supported', '-k', 'foo', '-s', 'bar'],
      pluginPathsWhitelist: ['./lib/plugins/config/config'],
      lifecycleHookNamesWhitelist: ['before:config:credentials:config'],
    }).then(unexpected, error => expect(error).to.be.instanceof(ServerlessError)));

  if (isTabCompletionSupported) {
    it('should support "config tabcompletion install" command', () =>
      runServerless({
        cwd: os.homedir(),
        env: { SHELL: 'bash' },
        cliArgs: ['config', 'tabcompletion', 'install'],
        pluginPathsWhitelist: ['./lib/plugins/config/config'],
        lifecycleHookNamesWhitelist: ['config:tabcompletion:install:install'],
      }).then(() =>
        Promise.all([
          fs
            .readFileAsync(path.resolve(os.homedir(), '.bashrc'), 'utf8')
            .then(bashRcContent =>
              expect(bashRcContent).to.include(' ~/.config/tabtab/__tabtab.bash')
            ),
          fs.readFileAsync(path.resolve(os.homedir(), '.config/tabtab/serverless.bash'), 'utf8'),
          fs.readFileAsync(path.resolve(os.homedir(), '.config/tabtab/sls.bash'), 'utf8'),
          fs.readFileAsync(path.resolve(os.homedir(), '.config/tabtab/slss.bash'), 'utf8'),
        ])
      ));

    it('should support "config tabcompletion uninstall" command', () =>
      runServerless({
        cwd: os.homedir(),
        env: { SHELL: 'bash' },
        cliArgs: ['config', 'tabcompletion', 'install'],
        pluginPathsWhitelist: ['./lib/plugins/config/config'],
        lifecycleHookNamesWhitelist: ['config:tabcompletion:install:install'],
      }).then(() =>
        runServerless({
          cwd: os.homedir(),
          env: { SHELL: 'bash' },
          cliArgs: ['config', 'tabcompletion', 'uninstall'],
          pluginPathsWhitelist: ['./lib/plugins/config/config'],
          lifecycleHookNamesWhitelist: ['config:tabcompletion:uninstall:uninstall'],
        }).then(() =>
          Promise.all([
            fs
              .readFileAsync(path.resolve(os.homedir(), '.config/tabtab/serverless.bash'))
              .then(unexpected, error => expect(error.code).to.equal('ENOENT')),
            fs
              .readFileAsync(path.resolve(os.homedir(), '.config/tabtab/sls.bash'))
              .then(unexpected, error => expect(error.code).to.equal('ENOENT')),
            fs
              .readFileAsync(path.resolve(os.homedir(), '.config/tabtab/slss.bash'))
              .then(unexpected, error => expect(error.code).to.equal('ENOENT')),
          ])
        )
      ));
  }
});
