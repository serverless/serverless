'use strict';

const { expect } = require('chai');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const overrideArgv = require('process-utils/override-argv');
const eventuallyListVersion = require('../../../../lib/cli/eventually-list-version');

describe('test/unit/lib/cli/eventually-list-version.test.js', () => {
  it('should log version on top level --version param', async () => {
    let stdoutData = '';
    expect(
      await overrideArgv({ args: ['serverless', '--version'] }, () =>
        overrideStdoutWrite(
          (data) => (stdoutData += data),
          () => eventuallyListVersion()
        )
      )
    ).to.equal(true);
    expect(stdoutData).to.have.string('Framework Core: ');
  });
  it('should log version on deep --version param', async () => {
    let stdoutData = '';
    expect(
      await overrideArgv({ args: ['serverless', 'deploy', 'function', '--version'] }, () =>
        overrideStdoutWrite(
          (data) => (stdoutData += data),
          () => eventuallyListVersion()
        )
      )
    ).to.equal(true);
    expect(stdoutData).to.have.string('Framework Core: ');
  });
  it('should log version on top level -v param', async () => {
    let stdoutData = '';
    expect(
      await overrideArgv({ args: ['serverless', '-v'] }, () =>
        overrideStdoutWrite(
          (data) => (stdoutData += data),
          () => eventuallyListVersion()
        )
      )
    ).to.equal(true);
    expect(stdoutData).to.have.string('Framework Core: ');
  });
  it('should not log version on deep -v param', async () => {
    let stdoutData = '';
    expect(
      await overrideArgv({ args: ['serverless', 'deploy', 'function', '-v'] }, () =>
        overrideStdoutWrite(
          (data) => (stdoutData += data),
          () => eventuallyListVersion()
        )
      )
    ).to.equal(false);
    expect(stdoutData).to.equal('');
  });
  it('should not log version when no params', async () => {
    let stdoutData = '';
    expect(
      await overrideArgv({ args: ['serverless'] }, () =>
        overrideStdoutWrite(
          (data) => (stdoutData += data),
          () => eventuallyListVersion()
        )
      )
    ).to.equal(false);
    expect(stdoutData).to.equal('');
  });
  it('should not log version when no version params', async () => {
    let stdoutData = '';
    expect(
      await overrideArgv({ args: ['serverless', 'deploy', 'function'] }, () =>
        overrideStdoutWrite(
          (data) => (stdoutData += data),
          () => eventuallyListVersion()
        )
      )
    ).to.equal(false);
    expect(stdoutData).to.equal('');
  });
});
