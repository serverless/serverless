'use strict';

const { expect } = require('chai');
const { ServerlessError } = require('../../classes/Error');
const runServerless = require('../../../tests/utils/run-serverless');

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
    }).then(
      () => {
        throw new Error('Unexpected');
      },
      error => expect(error).to.be.instanceof(ServerlessError)
    ));

  it('should throw an error if user passed unsupported "provider" option', () =>
    runServerless({
      config: { service: 'foo', provider: 'aws' },
      cliArgs: ['config', 'credentials', '--provider', 'not-supported', '-k', 'foo', '-s', 'bar'],
      pluginPathsWhitelist: ['./lib/plugins/config/config'],
      lifecycleHookNamesWhitelist: ['before:config:credentials:config'],
    }).then(
      () => {
        throw new Error('Unexpected');
      },
      error => expect(error).to.be.instanceof(ServerlessError)
    ));
});
