'use strict';

const { expect } = require('chai');
const overrideArgv = require('process-utils/override-argv');
const resolveInput = require('../../../../../lib/cli/resolve-input');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const renderHelp = require('../../../../../lib/cli/render-help');

describe('test/unit/lib/cli/render-help/index.test.js', () => {
  it('should show general help on main command', () => {
    resolveInput.clear();
    overrideArgv(
      {
        args: ['serverless', '--help'],
      },
      () => resolveInput()
    );
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderHelp(new Set())
    );
    expect(stdoutData).to.have.string('General Commands');
    expect(stdoutData).to.have.string('deploy function');
  });

  it('should show interactive help when requested', () => {
    resolveInput.clear();
    overrideArgv(
      {
        args: ['serverless', '--help-interactive'],
      },
      () => resolveInput()
    );
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderHelp(new Set())
    );
    expect(stdoutData).to.have.string('Interactive CLI');
    expect(stdoutData).to.have.string('--help-interactive');
  });

  it('should show general help on help command', () => {
    resolveInput.clear();
    overrideArgv(
      {
        args: ['serverless', 'help'],
      },
      () => resolveInput()
    );
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderHelp(new Set())
    );
    expect(stdoutData).to.have.string('General Commands');
    expect(stdoutData).to.have.string('deploy function');
  });

  it('should show specific commmand help with specific command', () => {
    resolveInput.clear();
    const { commandsSchema } = overrideArgv(
      {
        args: ['serverless', 'deploy', '--help'],
      },
      () => resolveInput()
    );
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderHelp(new Set())
    );
    expect(stdoutData).to.have.string('deploy');
    expect(stdoutData).to.have.string('deploy function');
    expect(stdoutData).to.have.string('--help');
    expect(stdoutData).to.have.string(commandsSchema.get('deploy').usage);
    expect(stdoutData).to.have.string(commandsSchema.get('deploy function').usage);
  });
});
