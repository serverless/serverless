'use strict';

const { expect } = require('chai');
const overrideArgv = require('process-utils/override-argv');
const ServerlessError = require('../../../../lib/serverless-error');
const resolveInput = require('../../../../lib/cli/resolve-input');
const { triggeredDeprecations } = require('../../../../lib/utils/logDeprecation');
const ensureSupportedCommand = require('../../../../lib/cli/ensure-supported-command');

describe('test/unit/lib/cli/ensure-supported-command.test.js', () => {
  it('should do nothing on valid command', async () => {
    resolveInput.clear();
    triggeredDeprecations.clear();
    overrideArgv(
      {
        args: ['serverless', 'login'],
      },
      () => resolveInput()
    );
    ensureSupportedCommand();
  });

  it('should do nothing on container commmand', async () => {
    resolveInput.clear();
    triggeredDeprecations.clear();
    overrideArgv(
      {
        args: ['serverless', 'config', 'tabcompletion'],
      },
      () => resolveInput()
    );
    ensureSupportedCommand();
  });

  it('should reject invalid command', async () => {
    resolveInput.clear();
    triggeredDeprecations.clear();
    overrideArgv(
      {
        args: ['serverless', 'hablo'],
      },
      () => resolveInput()
    );
    expect(() => ensureSupportedCommand())
      .to.throw(ServerlessError)
      .with.property('code', 'UNRECOGNIZED_CLI_COMMAND');
  });

  it('should report invalid options', async () => {
    resolveInput.clear();
    triggeredDeprecations.clear();
    overrideArgv(
      {
        args: ['serverless', 'login', '--hadsfa'],
      },
      () => resolveInput()
    );
    expect(() => ensureSupportedCommand())
      .to.throw(ServerlessError)
      .with.property('code', 'UNSUPPORTED_CLI_OPTIONS');
  });

  it('should reject missing options', async () => {
    resolveInput.clear();
    triggeredDeprecations.clear();
    overrideArgv(
      {
        args: ['serverless', 'config', 'credentials'],
      },
      () => resolveInput()
    );
    expect(() => ensureSupportedCommand())
      .to.throw(ServerlessError)
      .with.property('code', 'MISSING_REQUIRED_CLI_OPTION');
  });
});
