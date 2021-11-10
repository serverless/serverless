'use strict';

const { expect } = require('chai');
const renderGeneralHelp = require('../../../../../lib/cli/render-help/general');
const observeOutput = require('@serverless/test/observe-output');

describe('test/unit/lib/cli/render-help/general.test.js', () => {
  it('should show help', async () => {
    const output = await observeOutput(() => renderGeneralHelp(new Set()));
    expect(output).to.have.string('Usage');
    expect(output).to.have.string('deploy function');
  });
});
