'use strict';

const { expect } = require('chai');
const overrideArgv = require('process-utils/override-argv');
const resolveInput = require('../../../../../lib/cli/resolve-input');
const renderHelp = require('../../../../../lib/cli/render-help');
const observeOutput = require('@serverless/test/observe-output');

describe('test/unit/lib/cli/render-help/index.test.js', () => {
  it('should show general help on main command', async () => {
    resolveInput.clear();
    overrideArgv(
      {
        args: ['serverless', '--help'],
      },
      () => resolveInput()
    );
    const output = await observeOutput(() => renderHelp(new Set()));
    expect(output).to.have.string('Usage');
    expect(output).to.have.string('deploy function');
  });

  it('should show interactive help when requested', async () => {
    resolveInput.clear();
    overrideArgv(
      {
        args: ['serverless', '--help-interactive'],
      },
      () => resolveInput()
    );
    const output = await observeOutput(() => renderHelp(new Set()));
    expect(output).to.have.string('Interactive CLI');
    expect(output).to.have.string('--help-interactive');
  });

  it('should show general help on help command', async () => {
    resolveInput.clear();
    overrideArgv(
      {
        args: ['serverless', 'help'],
      },
      () => resolveInput()
    );
    const output = await observeOutput(() => renderHelp(new Set()));
    expect(output).to.have.string('Usage');
    expect(output).to.have.string('deploy function');
  });

  it('should show specific commmand help with specific command', async () => {
    resolveInput.clear();
    const { commandsSchema } = overrideArgv(
      {
        args: ['serverless', 'deploy', '--help'],
      },
      () => resolveInput()
    );
    const output = await observeOutput(() => renderHelp(new Set()));
    expect(output).to.have.string('deploy');
    expect(output).to.have.string('deploy function');
    expect(output).to.have.string('--help');
    expect(output).to.have.string(commandsSchema.get('deploy').usage);
    expect(output).to.have.string(commandsSchema.get('deploy function').usage);
  });
});
