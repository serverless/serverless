'use strict';
const sandbox = require('sinon');
const expect = require('chai').expect;
const mockRequire = require('mock-require');
const overrideEnv = require('process-utils/override-env');

describe('#logDeprecation()', () => {
  let consoleLogSpy;
  let restoreEnv;
  let logDeprecation;

  beforeEach(() => {
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    consoleLogSpy = sandbox.spy(console, 'log');
    ({ restoreEnv } = overrideEnv());
  });

  afterEach(() => {
    sandbox.restore();
    restoreEnv();
  });

  it('Should log deprecation message if not disabled and first time', () => {
    logDeprecation('code1', 'Start using depreication log', 'http://docsurl.org', {});
    const message = consoleLogSpy.args.join('\n');
    expect(consoleLogSpy.called).to.equal(true);
    expect(message).to.have.string('Start using depreication log');
    expect(message).to.have.string('http://docsurl.org');
  });

  it('Should not log deprecation if disabled in env.SLS_DEPRECATION_DISABLE', () => {
    process.env.SLS_DEPRECATION_DISABLE = 'code1';
    logDeprecation('code1', 'Start using depreication log', 'http://docsurl.org', {});
    expect(consoleLogSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled in env.serviceConfig', () => {
    const serviceConfig = { disabledCodes: 'code1' };
    logDeprecation('code1', 'Start using depreication log', 'http://docsurl.org', serviceConfig);
    expect(consoleLogSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled by wildcard in env', () => {
    process.env.SLS_DEPRECATION_DISABLE = '*';
    logDeprecation('code1', 'Start using depreication log', 'http://docsurl.org', {});
    expect(consoleLogSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled by wildcard in service config', () => {
    const serviceConfig = { disabledCodes: '*' };
    logDeprecation('code1', 'Start using depreication log', 'http://docsurl.org', serviceConfig);
    expect(consoleLogSpy.called).to.equal(false);
  });

  it('Should not log deprecation twice', () => {
    logDeprecation('code1', 'Start using depreication log', 'http://docsurl.org', {});
    logDeprecation('code1', 'Start using depreication log', 'http://docsurl.org', {});
    expect(consoleLogSpy.callCount).to.equal(1);
  });
});
