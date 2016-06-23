'use strict';

const expect = require('chai').expect;
const AwsRemove = require('../index');
const BbPromise = require('bluebird');
const Serverless = require('../../../../Serverless');

describe('#validate()', () => {
  const serverless = new Serverless();

  let awsRemove;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsRemove = new AwsRemove(serverless, options);
  });

  it('should throw an error if not inside a service (servicePath not defined)', () => {
    awsRemove.serverless.config.servicePath = false;

    // if we go inside "then", then no error was thrown as expected
    // so make assertion fail intentionally to let us know something is wrong
    return BbPromise.resolve()
      .then(() => awsRemove.validate())
      .then(() => expect(1).to.equal(2))
      .catch(e => expect(e.name)
        .to.be.equal('ServerlessError'));
  });

  it('should throw an error if region does not exist', () => {
    serverless.config.servicePath = true;
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {},
        },
      },
    };

    awsRemove.options.region = 'whatever';

    // if we go inside "then", then no error was thrown as expected
    // so make assertion fail intentionally to let us know something is wrong
    return BbPromise.resolve()
      .then(() => awsRemove.validate())
      .then(() => expect(1).to.equal(2))
      .catch(e => expect(e.name)
        .to.be.equal('ServerlessError'));
  });
});
