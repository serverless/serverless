'use strict';

const { expect } = require('chai');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const renderGeneralHelp = require('../../../../../lib/cli/render-help/general');

describe('test/unit/lib/cli/render-help/general.test.js', () => {
  it('should show help', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => renderGeneralHelp(new Set())
    );
    expect(stdoutData).to.have.string('General Commands');
    expect(stdoutData).to.have.string('deploy function');
  });
});
