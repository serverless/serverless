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

  it('should support the simplified string syntax', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: '$connect',
          },
        ],
      },
    };
    const validated = awsCompileWebsocketsEvents.validate();
    expect(validated.events).to.deep.equal([
      {
        functionName: 'first',
        route: '$connect',
      },
    ]);
  });

  it('should support the extended object syntax', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {
              route: '$connect',
            },
          },
        ],
      },
    };
    const validated = awsCompileWebsocketsEvents.validate();
    expect(validated.events).to.deep.equal([
      {
        functionName: 'first',
        route: '$connect',
      },
    ]);
  });

  it('should add authorizer config when authorizer is specified as a string', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {
              route: '$connect',
              authorizer: 'auth',
            },
          },
        ],
      },
    };
    const validated = awsCompileWebsocketsEvents.validate();
    expect(validated.events).to.deep.equal([
      {
        functionName: 'first',
        route: '$connect',
        authorizer: {
          name: 'auth',
          uri: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                { 'Fn::GetAtt': ['AuthLambdaFunction', 'Arn'] },
                '/invocations',
              ],
            ],
          },
          identitySource: ['route.request.header.Auth'],
          permission: 'AuthLambdaFunction',
        },
      },
    ]);
  });

  it('should add authorizer config when authorizer is specified as a string with arn', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {
              route: '$connect',
              authorizer: 'arn:aws:auth',
            },
          },
        ],
      },
    };
    const validated = awsCompileWebsocketsEvents.validate();
    expect(validated.events).to.deep.equal([
      {
        functionName: 'first',
        route: '$connect',
        authorizer: {
          name: 'auth',
          uri: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                'arn:aws:auth',
                '/invocations',
              ],
            ],
          },
          identitySource: ['route.request.header.Auth'],
          permission: 'arn:aws:auth',
        },
      },
    ]);
  });

  it('should add authorizer config when authorizer is specified as an object', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {
              route: '$connect',
              authorizer: {
                name: 'auth',
                identitySource: ['route.request.header.Auth', 'route.request.querystring.Auth'],
              },
            },
          },
        ],
      },
    };
    const validated = awsCompileWebsocketsEvents.validate();
    expect(validated.events).to.deep.equal([
      {
        functionName: 'first',
        route: '$connect',
        authorizer: {
          name: 'auth',
          uri: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                { 'Fn::GetAtt': ['AuthLambdaFunction', 'Arn'] },
                '/invocations',
              ],
            ],
          },
          identitySource: ['route.request.header.Auth', 'route.request.querystring.Auth'],
          permission: 'AuthLambdaFunction',
        },
      },
    ]);
  });

  it('should add authorizer config when authorizer is specified as an object with arn', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {
              route: '$connect',
              authorizer: {
                arn: 'arn:aws:auth',
                identitySource: ['route.request.header.Auth', 'route.request.querystring.Auth'],
              },
            },
          },
        ],
      },
    };
    const validated = awsCompileWebsocketsEvents.validate();
    expect(validated.events).to.deep.equal([
      {
        functionName: 'first',
        route: '$connect',
        authorizer: {
          name: 'auth',
          uri: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                'arn:aws:auth',
                '/invocations',
              ],
            ],
          },
          identitySource: ['route.request.header.Auth', 'route.request.querystring.Auth'],
          permission: 'arn:aws:auth',
        },
      },
    ]);
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
    expect(validated.events)
      .to.be.an('Array')
      .with.length(0);
  });

  it('should reject a websocket event without a route', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {},
          },
        ],
      },
    };
    expect(() => awsCompileWebsocketsEvents.validate()).to.throw(/set the "route"/);
  });

  it('should reject an authorizer definition without name nor arn', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {
              route: '$connect',
              authorizer: {
                identitySource: ['route.request.header.Auth', 'route.request.querystring.Auth'],
              },
            },
          },
        ],
      },
    };
    expect(() => awsCompileWebsocketsEvents.validate()).to.throw(/You must specify name or arn/);
  });

  it('should reject a usage of both, http and websocket event types', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {},
            http: {},
          },
        ],
      },
    };
    expect(() => awsCompileWebsocketsEvents.validate()).to.throw(/can either be/);
  });
});
