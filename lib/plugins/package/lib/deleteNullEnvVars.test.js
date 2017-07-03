'use strict';

/* eslint-disable no-unused-expressions */

const Serverless = require('../../../Serverless');
const Package = require('../package');

const expect = require('chai').expect;

describe('#deleteNullEnvVars()', () => {
  let serverless;
  let pkg;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    pkg = new Package(serverless, {});

    pkg.serverless.service.provider.environment = {
      SOME_VAR: 'some-value',
      OTHER_VAR: null,
    };
    pkg.serverless.service.functions = {
      hello: {
        handler: 'hello.js',
        environment: {
          VAR_ONE: 'one',
          VAR_TWO: null,
        },
      },
    };
  });

  it('should delete null environment variables', () => {
    pkg.deleteNullEnvVars();

    expect(pkg.serverless.service.provider.environment.SOME_VAR).to.equal('some-value');
    expect(pkg.serverless.service.provider.environment.OTHER_VAR).to.be.undefined;
    expect(pkg.serverless.service.functions.hello.environment.VAR_ONE).to.equal('one');
    expect(pkg.serverless.service.functions.hello.environment.VAR_TWO).to.be.undefined;
  });
});
