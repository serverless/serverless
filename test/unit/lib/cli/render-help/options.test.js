'use strict';

const { expect } = require('chai');
const renderOptionsHelp = require('../../../../../lib/cli/render-help/options');
const observeOutput = require('@serverless/test/observe-output');

describe('test/unit/lib/cli/render-help/options.test.js', () => {
  it('should list options', async () => {
    const output = await observeOutput(() =>
      renderOptionsHelp({
        foo: {
          usage: 'Some option',
          shortcut: 'b',
          required: true,
        },
        bar: {
          usage: 'Elo',
        },
        noData: {},
      })
    );
    expect(output).to.have.string('--foo');
    expect(output).to.have.string('-b');
    expect(output).to.have.string('Some option');
  });
});
