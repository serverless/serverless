'use strict';

const { expect } = require('chai');
const overrideArgv = require('process-utils/override-argv');
const isHelpRequest = require('../../../../lib/cli/is-help-request');

describe('test/unit/lib/cli/is-help-request.test.js', () => {
  it('recognize --help', async () => {
    expect(overrideArgv({ args: ['serverless', '--help'] }, () => isHelpRequest())).to.equal(true);
  });

  it('recognize deep --help', async () => {
    expect(
      overrideArgv({ args: ['serverless', 'foo', 'bar', '--help'] }, () => isHelpRequest())
    ).to.equal(true);
  });

  it('recognize --help-interactive', async () => {
    expect(
      overrideArgv({ args: ['serverless', '--help-interactive'] }, () => isHelpRequest())
    ).to.equal(true);
  });

  it('recognize "help" command', async () => {
    expect(overrideArgv({ args: ['serverless', 'help'] }, () => isHelpRequest())).to.equal(true);
  });

  it('return "false" otherwise', async () => {
    expect(
      overrideArgv({ args: ['serverless', 'some-command', '--foo'] }, () => isHelpRequest())
    ).to.equal(false);
  });
});
