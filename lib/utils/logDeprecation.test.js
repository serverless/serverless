'use strict';
const sandbox = require('sinon');
const expect = require('chai').expect;
const mockRequire = require('mock-require');
const overrideEnv = require('process-utils/override-env');
const runServerless = require('../../tests/utils/run-serverless');
const fixtures = require('../../tests/fixtures');

describe('#logDeprecation()', () => {
  let stdoutWriteSpy;
  let restoreEnv;
  let originalEnv;
  let logDeprecation;

  beforeEach(() => {
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    stdoutWriteSpy = sandbox.spy(process.stdout, 'write');
    ({ originalEnv, restoreEnv } = overrideEnv());
  });

  afterEach(() => {
    sandbox.restore();
    restoreEnv();
  });

  it('Should log deprecation message if not disabled and first time', () => {
    logDeprecation('code1', 'Start using deprecation log');
    const message = stdoutWriteSpy.args.join('\n');
    expect(stdoutWriteSpy.called).to.equal(true);
    expect(message).to.have.string('Deprecation Notice');
    expect(message).to.have.string('https://www.serverless.com/framework/docs/deprecations/#code1');
  });

  it('Should not log deprecation if disabled in env.SLS_DEPRECATION_DISABLE', () => {
    process.env.SLS_DEPRECATION_DISABLE = 'code1';
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    logDeprecation('code1', 'Start using deprecation log');
    expect(stdoutWriteSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled in serviceConfig', () => {
    // We need original process env variables for npm-conf
    Object.assign(process.env, originalEnv);
    return fixtures
      .extend('function', { disabledDeprecations: ['code1'] })
      .then(fixturePath => runServerless({ cwd: fixturePath, cliArgs: ['package'] }))
      .then(serverless => {
        stdoutWriteSpy.clear;
        const serviceConfig = serverless.service;
        stdoutWriteSpy.resetHistory();
        logDeprecation('code1', 'Start using deprecation log', { serviceConfig });
        expect(stdoutWriteSpy.called).to.equal(false);
      });
  });

  it('Should not log deprecation if disabled by wildcard in env', () => {
    process.env.SLS_DEPRECATION_DISABLE = '*';
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    logDeprecation('code1', 'Start using deprecation log');
    expect(stdoutWriteSpy.called).to.equal(false);
  });

  it('Should not log deprecation if disabled by wildcard in service config', () => {
    Object.assign(process.env, originalEnv);
    return fixtures
      .extend('function', { disabledDeprecations: '*' })
      .then(fixturePath => runServerless({ cwd: fixturePath, cliArgs: ['package'] }))
      .then(serverless => {
        stdoutWriteSpy.clear;
        const serviceConfig = serverless.service;
        stdoutWriteSpy.resetHistory();
        logDeprecation('code1', 'Start using deprecation log', { serviceConfig });
        expect(stdoutWriteSpy.called).to.equal(false);
      });
  });

  it('Should not log deprecation twice', () => {
    logDeprecation('code1', 'Start using deprecation log');
    logDeprecation('code1', 'Start using deprecation log');
    expect(stdoutWriteSpy.callCount).to.equal(1);
  });

  it('Should ignore serviceConfig.disabledDeprecations if it is an object without an error', () => {
    Object.assign(process.env, originalEnv);
    return fixtures
      .extend('function', {
        disabledDeprecations: {
          code1: true,
        },
      })
      .then(fixturePath => runServerless({ cwd: fixturePath, cliArgs: ['package'] }))
      .then(serverless => {
        stdoutWriteSpy.clear;
        const serviceConfig = serverless.service;
        stdoutWriteSpy.resetHistory();
        logDeprecation('code1', 'Start using deprecation log', { serviceConfig });
        expect(stdoutWriteSpy.called).to.equal(true);
      });
  });
});
