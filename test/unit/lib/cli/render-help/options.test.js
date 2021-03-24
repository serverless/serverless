'use strict';

const { expect } = require('chai');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const renderOptionsHelp = require('../../../../../lib/cli/render-help/options');

describe('test/unit/lib/cli/render-help/options.test.js', () => {
  it('should list options', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () =>
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
    expect(stdoutData).to.have.string('--foo');
    expect(stdoutData).to.have.string('-b');
    expect(stdoutData).to.have.string('Some option');
  });
});
