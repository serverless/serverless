'use strict';

const { expect } = require('chai');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const listVersion = require('../../../../lib/cli/render-version');

describe('test/unit/lib/cli/list-version.test.js', () => {
  it('should log version', async () => {
    let stdoutData = '';
    await overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => listVersion()
    );
    expect(stdoutData).to.have.string('Framework Core: ');
    expect(stdoutData).to.have.string('SDK: ');
  });
});
