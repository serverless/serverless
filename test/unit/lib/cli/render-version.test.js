'use strict';

const { expect } = require('chai');
const listVersion = require('../../../../lib/cli/render-version');
const observeOutput = require('@serverless/test/observe-output');

describe('test/unit/lib/cli/list-version.test.js', () => {
  it('should log version', async () => {
    const output = await observeOutput(() => listVersion());
    expect(output).to.have.string('Framework Core: ');
    expect(output).to.have.string('SDK: ');
  });
});
