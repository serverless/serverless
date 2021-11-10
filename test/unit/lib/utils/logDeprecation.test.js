'use strict';

const sandbox = require('sinon');
const expect = require('chai').expect;
const overrideEnv = require('process-utils/override-env');
const ServerlessError = require('../../../../lib/serverless-error');

describe('test/unit/lib/utils/logDeprecation.test.js', () => {
  let restoreEnv;

  beforeEach(() => {
    delete require.cache[require.resolve('../../../../lib/utils/logDeprecation')];
    ({ restoreEnv } = overrideEnv({
      whitelist: ['APPDATA', 'HOME', 'PATH', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE'],
    }));
  });

  afterEach(() => {
    sandbox.restore();
    restoreEnv();
  });

  it('should throw on deprecation if error notifications mode set in service config', () => {
    const logDeprecation = require('../../../../lib/utils/logDeprecation');
    expect(() =>
      logDeprecation('CODE1', 'Start using deprecation log', {
        serviceConfig: { deprecationNotificationMode: 'error' },
      })
    )
      .to.throw(ServerlessError)
      .with.property('code', 'REJECTED_DEPRECATION_CODE1');
  });
});
