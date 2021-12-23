'use strict';

const { expect } = require('chai');
const renderCommandHelp = require('../../../../../lib/cli/render-help/command');
const commandsSchema = require('../../../../../lib/cli/commands-schema');
const observeOutput = require('@serverless/test/observe-output');

describe('test/unit/lib/cli/render-help/command.test.js', () => {
  it('should show help', async () => {
    const output = await observeOutput(() => renderCommandHelp('deploy'));
    expect(output).to.have.string('deploy');
    expect(output).to.have.string('deploy function');
    expect(output).to.have.string('--help');
    expect(output).to.have.string(commandsSchema.get('deploy').usage);
    expect(output).to.have.string(commandsSchema.get('deploy function').usage);
  });
  it('should show help for container command', async () => {
    const output = await observeOutput(() => renderCommandHelp('plugin'));
    expect(output).to.have.string('plugin install');
    expect(output).to.have.string(commandsSchema.get('plugin install').usage);
    expect(output).to.have.string(commandsSchema.get('plugin uninstall').usage);
  });
});
