'use strict';

const sandbox = require('sinon');
const expect = require('chai').expect;
const mockRequire = require('mock-require');
const overrideEnv = require('process-utils/override-env');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const runServerless = require('../../test/utils/run-serverless');

describe('#logDeprecation()', () => {
  let restoreEnv;
  let originalEnv;
  let logDeprecation;

  beforeEach(() => {
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    ({ originalEnv, restoreEnv } = overrideEnv());
  });

  afterEach(() => {
    sandbox.restore();
    restoreEnv();
  });

  it('Should log deprecation message if not disabled and first time', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      data => (stdoutData += data),
      () => logDeprecation('CODE1', 'Start using deprecation log')
    );
    expect(stdoutData).to.include('Start using deprecation log');

    expect(stdoutData).to.include('Deprecation warning');
    expect(stdoutData).to.include('https://www.serverless.com/framework/docs/deprecations/#CODE1');
  });

  it('Should not log deprecation if disabled in env.SLS_DEPRECATION_DISABLE', () => {
    process.env.SLS_DEPRECATION_DISABLE = 'CODE1';
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    let stdoutData = '';
    overrideStdoutWrite(
      data => (stdoutData += data),
      () => logDeprecation('CODE1', 'Start using deprecation log')
    );
    expect(stdoutData).to.equal('');
  });

  it('Should not log deprecation if disabled in serviceConfig', () => {
    // We need original process env variables for npm-conf
    Object.assign(process.env, originalEnv);
    return runServerless({
      fixture: 'function',
      configExt: { disabledDeprecations: ['CODE1'] },
      cliArgs: ['package'],
    }).then(({ serverless }) => {
      const serviceConfig = serverless.service;
      let stdoutData = '';
      overrideStdoutWrite(
        data => (stdoutData += data),
        () => logDeprecation('CODE1', 'Start using deprecation log', { serviceConfig })
      );
      expect(stdoutData).to.equal('');
    });
  });

  it('Should not log deprecation if disabled by wildcard in env', () => {
    process.env.SLS_DEPRECATION_DISABLE = '*';
    logDeprecation = mockRequire.reRequire('./logDeprecation');
    let stdoutData = '';
    overrideStdoutWrite(
      data => (stdoutData += data),
      () => logDeprecation('CODE1', 'Start using deprecation log')
    );
    expect(stdoutData).to.equal('');
  });

  it('Should not log deprecation if disabled by wildcard in service config', () => {
    Object.assign(process.env, originalEnv);
    return runServerless({
      fixture: 'function',
      configExt: { disabledDeprecations: '*' },
      cliArgs: ['package'],
    }).then(({ serverless }) => {
      const serviceConfig = serverless.service;
      let stdoutData = '';
      overrideStdoutWrite(
        data => (stdoutData += data),
        () => logDeprecation('CODE1', 'Start using deprecation log', { serviceConfig })
      );
      expect(stdoutData).to.equal('');
    });
  });

  it('Should not log deprecation twice', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      data => (stdoutData += data),
      () => {
        logDeprecation('CODE1', 'Start using deprecation log');
        expect(stdoutData).to.include('Start using deprecation log');
        stdoutData = '';
        logDeprecation('CODE1', 'Start using deprecation log');
      }
    );
    expect(stdoutData).to.equal('');
  });
});
