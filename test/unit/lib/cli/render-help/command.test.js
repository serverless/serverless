'use strict';

const { expect } = require('chai');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const renderCommandHelp = require('../../../../../lib/cli/render-help/command');
const commandsSchema = require('../../../../../lib/cli/commands-schema');

describe('test/unit/lib/cli/render-help/command.test.js', () => {
  it('should show help', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderCommandHelp('deploy')
    );
    expect(stdoutData).to.have.string('deploy');
    expect(stdoutData).to.have.string('deploy function');
    expect(stdoutData).to.have.string('--help');
    expect(stdoutData).to.have.string(commandsSchema.get('deploy').usage);
    expect(stdoutData).to.have.string(commandsSchema.get('deploy function').usage);
  });
  it('should show help for container command', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderCommandHelp('config tabcompletion')
    );
    expect(stdoutData).to.have.string('config tabcompletion install');
    expect(stdoutData).to.have.string(commandsSchema.get('config tabcompletion install').usage);
    expect(stdoutData).to.have.string(commandsSchema.get('config tabcompletion uninstall').usage);
  });
});
