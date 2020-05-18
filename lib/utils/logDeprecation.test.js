'use strict';
const sandbox = require('sinon');
const expect = require('chai').expect;
const mockRequire = require('mock-require');
const overrideEnv = require('process-utils/override-env');

describe('#logDeprecation()', () => {
  let stdoutWriteSpy;
  let restoreEnv;
  let logDeprecation;

  beforeEach(() => {
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    stdoutWriteSpy = sandbox.spy(process.stdout, 'write');
    ({ restoreEnv } = overrideEnv());
  });

  afterEach(() => {
    sandbox.restore();
    restoreEnv();
  });

  it('Should log deprecation message if not disabled and first time', () => {
    logDeprecation('code1', 'Start using depreication log');
    const message = stdoutWriteSpy.args.join('\n');
    expect(stdoutWriteSpy.called).to.equal(true);
    expect(message).to.have.string('Deprecation Warning');
    expect(message).to.have.string('https://www.serverless.com/framework/docs/deprecations/#code');
  });

  it('Should not log deprecation if disabled in env.SLS_DEPRECATION_DISABLE', () => {
    process.env.SLS_DEPRECATION_DISABLE = 'code1';
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    logDeprecation('code1', 'Start using depreication log');
    expect(stdoutWriteSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled in serviceConfig', () => {
    const serviceConfig = { disabledCodes: 'code1' };
    logDeprecation('code1', 'Start using depreication log', { serviceConfig });
    expect(stdoutWriteSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled by wildcard in env', () => {
    process.env.SLS_DEPRECATION_DISABLE = '*';
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    logDeprecation('code1', 'Start using depreication log');
    expect(stdoutWriteSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled by wildcard in service config', () => {
    const serviceConfig = { disabledCodes: '*' };
    logDeprecation('code1', 'Start using depreication log', { serviceConfig });
    expect(stdoutWriteSpy.called).to.equal(false);
  });

  it('Should not log deprecation twice', () => {
    logDeprecation('code1', 'Start using depreication log');
    logDeprecation('code1', 'Start using depreication log');
    expect(stdoutWriteSpy.callCount).to.equal(1);
  });
});
