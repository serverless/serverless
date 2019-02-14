'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');
const AwsProvider = require('../../../../../provider/awsProvider');

describe('#validate()', () => {
  let serverless;
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileWebsocketsEvents = new AwsCompileWebsocketsEvents(serverless, options);
  });

  it('should ignore non-websocket events', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            ignored: {},
          },
        ],
      },
    };
    const validated = awsCompileWebsocketsEvents.validate();
    expect(validated.events).to.be.an('Array').with.length(0);
  });

  it('should reject a websocket event without a routeKey', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {},
          },
        ],
      },
    };
    expect(() => awsCompileWebsocketsEvents.validate()).to.throw(/set the "routeKey"/);
  });
});
