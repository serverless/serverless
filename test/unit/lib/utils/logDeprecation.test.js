'use strict';

const sandbox = require('sinon');
const expect = require('chai').expect;
const overrideEnv = require('process-utils/override-env');
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const runServerless = require('../../../utils/run-serverless');
const ServerlessError = require('../../../../lib/serverless-error');

describe('#logDeprecation()', () => {
  let restoreEnv;
  let originalEnv;

  beforeEach(() => {
    delete require.cache[require.resolve('../../../../lib/utils/logDeprecation')];
    ({ originalEnv, restoreEnv } = overrideEnv());
  });

  afterEach(() => {
    sandbox.restore();
    restoreEnv();
  });

  it('Should log deprecation message if not disabled and first time', () => {
    const logDeprecation = require('../../../../lib/utils/logDeprecation');
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => logDeprecation('CODE1', 'Start using deprecation log')
    );
    expect(stdoutData).to.include('Start using deprecation log');

    expect(stdoutData).to.include('Deprecation warning');
    expect(stdoutData).to.include('https://www.serverless.com/framework/docs/deprecations/#CODE1');
  });

  it('Should not log deprecation if disabled in env.SLS_DEPRECATION_DISABLE', () => {
    process.env.SLS_DEPRECATION_DISABLE = 'CODE1';
    const logDeprecation = require('../../../../lib/utils/logDeprecation');

    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => logDeprecation('CODE1', 'Start using deprecation log')
    );
    expect(stdoutData).to.equal('');
  });

  it('Should not log deprecation if disabled in serviceConfig', () => {
    // We need original process env variables for npm-conf
    Object.assign(process.env, originalEnv);
    const logDeprecation = require('../../../../lib/utils/logDeprecation');
    return runServerless({
      fixture: 'function',
      configExt: { disabledDeprecations: ['CODE1'] },
      command: 'package',
    }).then(({ serverless }) => {
      const serviceConfig = serverless.service;
      let stdoutData = '';
      overrideStdoutWrite(
        (data) => (stdoutData += data),
        () => logDeprecation('CODE1', 'Start using deprecation log', { serviceConfig })
      );
      expect(stdoutData).to.equal('');
    });
  });

  it('Should not log deprecation if disabled by wildcard in env', () => {
    process.env.SLS_DEPRECATION_DISABLE = '*';
    const logDeprecation = require('../../../../lib/utils/logDeprecation');
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => logDeprecation('CODE1', 'Start using deprecation log')
    );
    expect(stdoutData).to.equal('');
  });

  it('Should not log deprecation if disabled by wildcard in service config', () => {
    Object.assign(process.env, originalEnv);
    const logDeprecation = require('../../../../lib/utils/logDeprecation');
    return runServerless({
      fixture: 'function',
      configExt: { disabledDeprecations: '*' },
      command: 'package',
    }).then(({ serverless }) => {
      const serviceConfig = serverless.service;
      let stdoutData = '';
      overrideStdoutWrite(
        (data) => (stdoutData += data),
        () => logDeprecation('CODE1', 'Start using deprecation log', { serviceConfig })
      );
      expect(stdoutData).to.equal('');
    });
  });

  it('Should throw on deprecation if env.SLS_DEPRECATION_NOTIFICATION_MODE=error', () => {
    process.env.SLS_DEPRECATION_NOTIFICATION_MODE = 'error';
    const logDeprecation = require('../../../../lib/utils/logDeprecation');
    expect(() => logDeprecation('CODE1', 'Start using deprecation log'))
      .to.throw(ServerlessError)
      .with.property('code', 'REJECTED_DEPRECATION_CODE1');
  });

  it('Should throw on deprecation if error notifications mode set in service config', () => {
    const logDeprecation = require('../../../../lib/utils/logDeprecation');
    expect(() =>
      logDeprecation('CODE1', 'Start using deprecation log', {
        serviceConfig: { deprecationNotificationMode: 'error' },
      })
    )
      .to.throw(ServerlessError)
      .with.property('code', 'REJECTED_DEPRECATION_CODE1');
  });

  it('Should not log deprecation twice', () => {
    let stdoutData = '';
    overrideStdoutWrite(
      (data) => (stdoutData += data),
      () => {
        const logDeprecation = require('../../../../lib/utils/logDeprecation');
        logDeprecation('CODE1', 'Start using deprecation log');
        expect(stdoutData).to.include('Start using deprecation log');
        stdoutData = '';
        logDeprecation('CODE1', 'Start using deprecation log');
      }
    );
    expect(stdoutData).to.equal('');
  });
});
