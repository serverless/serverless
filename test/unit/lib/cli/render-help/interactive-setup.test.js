'use strict';

const { expect } = require('chai');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const renderInteractiveSetupHelp = require('../../../../../lib/cli/render-help/interactive-setup');

describe('test/unit/lib/cli/render-help/interactive-setup.test.js', () => {
  it('should show help', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderInteractiveSetupHelp()
    );
    expect(stdoutData).to.have.string('Interactive CLI');
    expect(stdoutData).to.have.string('--help-interactive');
  });
});
