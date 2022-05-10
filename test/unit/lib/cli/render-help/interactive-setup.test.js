'use strict';

const { expect } = require('chai');
const renderInteractiveSetupHelp = require('../../../../../lib/cli/render-help/interactive-setup');
const observeOutput = require('@serverless/test/observe-output');

describe('test/unit/lib/cli/render-help/interactive-setup.test.js', () => {
  it('should show help', async () => {
    const output = await observeOutput(() => renderInteractiveSetupHelp());
    expect(output).to.have.string('Interactive CLI');
    expect(output).to.have.string('--help-interactive');
  });
});
