'use strict';

const expect = require('chai').expect;
const AwsCompileWebsocketsEvents = require('../../../../../../../../../../lib/plugins/aws/package/compile/events/websockets/index');
const Serverless = require('../../../../../../../../../../lib/serverless');
const AwsProvider = require('../../../../../../../../../../lib/plugins/aws/provider');
const runServerless = require('../../../../../../../../../utils/run-serverless');

describe('#validate()', () => {
  let serverless;
  let awsCompileWebsocketsEvents;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless({ commands: [], options: {} });
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

  it('should add routeResponse when routeResponseSelectionExpression is configured', () => {
    awsCompileWebsocketsEvents.serverless.service.functions = {
      first: {
        events: [
          {
            websocket: {
              route: '$connect',
              routeResponseSelectionExpression: '$default',
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
        routeResponseSelectionExpression: '$default',
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
    expect(validated.events).to.be.an('Array').with.length(0);
  });
});

describe('#validate() using runServerless util', () => {
  it('should use provided authorizer name when name field is supplied', async () => {
    const nameField = 'authName';

    const { cfTemplate, awsNaming } = await runServerless({
      fixture: 'function',
      configExt: {
        functions: {
          first: {
            handler: 'index.handler',
            events: [
              {
                websocket: {
                  route: '$connect',
                  authorizer: {
                    name: nameField,
                    arn: {
                      'Fn::Join': [':', ['arn', 'arnName']],
                    },
                  },
                },
              },
            ],
          },
        },
      },
      command: 'package',
    });

    const cfResources = cfTemplate.Resources;
    const naming = awsNaming;

    expect(cfResources[naming.getWebsocketsAuthorizerLogicalId(nameField)]).to.exist;

    expect(
      cfResources[naming.getWebsocketsAuthorizerLogicalId(nameField)].Properties.Name
    ).to.deep.equal(nameField);
  });
});
