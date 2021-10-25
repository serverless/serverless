'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

const { expect } = chai;

describe('lib/plugins/aws/package/compile/events/httpApi.test.js', () => {
  it('should not configure HTTP API resources when no events are configured', () =>
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      command: 'package',
    }).then(({ serverless }) => {
      const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverless.getProvider('aws').naming;

      expect(cfResources[naming.getHttpApiLogicalId()]).to.equal();
      expect(cfResources[naming.getHttpApiStageLogicalId()]).to.equal();
    }));

  describe('Basic configuration', () => {
    let cfResources;
    let cfOutputs;
    let naming;

    before(() =>
      runServerless({
        fixture: 'httpApi',
        command: 'package',
        configExt: {
          functions: {
            catchAll: { handler: 'index.handler', events: [{ httpApi: '*' }] },
            methodCatchAll: {
              handler: 'index.handler',
              events: [{ httpApi: { method: '*', path: '/method-catch-all' } }],
            },
            payload: {
              handler: 'index.handler',
              httpApi: { payload: '1.0' },
              events: [{ httpApi: { method: 'options', path: '/payload' } }],
            },
            payloadCatchAll: {
              handler: 'index.handler',
              events: [{ httpApi: 'ANY /payload' }],
            },
            customTimeout: {
              handler: 'index.handler',
              events: [{ httpApi: 'ANY /custom-timeout' }],
              timeout: 29,
            },
            maxTimeout: {
              handler: 'index.handler',
              events: [{ httpApi: 'ANY /max-timeout' }],
              timeout: 30,
            },
          },
        },
      }).then(({ awsNaming, cfTemplate }) => {
        ({ Resources: cfResources, Outputs: cfOutputs } = cfTemplate);
        naming = awsNaming;
      })
    );

    it('should configure API resource', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Api');
      expect(resource.Properties).to.have.property('Name');
      expect(resource.Properties.ProtocolType).to.equal('HTTP');
    });

    it('should configure stage resource', () => {
      const resource = cfResources[naming.getHttpApiStageLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Stage');
      expect(resource.Properties.StageName).to.equal('$default');
      expect(resource.Properties.AutoDeploy).to.equal(true);
    });

    it('should configure output for HttpApiId', () => {
      const output = cfOutputs.HttpApiId;
      expect(output).to.have.property('Value');
    });

    it('should configure output for HttpApiUrl', () => {
      const output = cfOutputs.HttpApiUrl;
      expect(output).to.have.property('Value');
    });

    it('should configure endpoint', () => {
      const routeKey = 'POST /some-post';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });

    it('should configure endpoint integration', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Integration');
      expect(resource.Properties.IntegrationType).to.equal('AWS_PROXY');
      expect(resource.Properties.PayloadFormatVersion).to.equal('2.0');
    });

    it('should configure catch all endpoint', () => {
      const routeKey = '*';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal('$default');
    });

    it('should configure method catch all endpoint', () => {
      const routeKey = 'ANY /method-catch-all';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });

    it('should configure endpoint with specific method and path', () => {
      const routeKey = 'OPTIONS /payload';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });

    it('should configure method catch all endpoint with same path as a specific method endpoint', () => {
      const routeKey = 'ANY /payload';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });

    it('should ensure higher timeout than function default value', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
      expect(resource.Properties.TimeoutInMillis).to.equal(6500);
    });

    it('should provide 0.5s time margin to custom function integration timeout', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('customTimeout')];
      expect(resource.Properties.TimeoutInMillis).to.equal(29500);
    });

    it('should limit function maximum integration timeout to 30s', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('maxTimeout')];
      expect(resource.Properties.TimeoutInMillis).to.equal(30000);
    });

    it('should configure lambda permissions', () => {
      const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::Lambda::Permission');
      expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
    });

    it('should not configure default route', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Properties).to.not.have.property('RouteKey');
      expect(resource.Properties).to.not.have.property('Target');
    });

    it('should not configure optional resources and properties by default', () => {
      const apiResource = cfResources[naming.getHttpApiLogicalId()];
      expect(apiResource.Properties).to.not.have.property('CorsConfiguration');
      expect(cfResources).to.not.have.property(naming.getHttpApiLogGroupLogicalId());
      const stageResource = cfResources[naming.getHttpApiStageLogicalId()];
      expect(stageResource.Properties.DefaultRouteSettings.DetailedMetricsEnabled).to.equal(false);
    });

    it('should not disable default execute-api endpoint', () => {
      const apiResource = cfResources[naming.getHttpApiLogicalId()];
      expect(apiResource.Properties.DisableExecuteApiEndpoint).to.equal(undefined);
    });

    it('should support payload format version per function', async () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('payload')];
      expect(resource.Properties.PayloadFormatVersion).to.equal('1.0');
    });
  });

  describe('Provider properties', () => {
    let cfApi;
    let cfStage;
    let cfIntegration;
    let cfLogGroup;
    let cfCors;
    let serviceConfig;

    before(() =>
      runServerless({
        fixture: 'httpApi',
        configExt: {
          provider: {
            httpApi: {
              name: 'TestHttpApi',
              payload: '1.0',
              cors: true,
              metrics: true,
              disableDefaultEndpoint: true,
              authorizers: {
                someAuthorizer: {
                  identitySource: '$request.header.Authorization',
                  issuerUrl: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
                  audience: 'audiencexxx',
                },
              },
            },
            logs: {
              httpApi: true,
            },
            tags: {
              'providerTagA': 'providerTagAValue',
              'providerTagB': 'providerTagBValue',
              'provider:tagC': 'providerTagCValue',
              'provider:tag-D': 'providerTagDValue',
            },
          },
          functions: {
            authorized: {
              handler: 'index.handler',
              events: [
                {
                  httpApi: {
                    method: 'GET',
                    path: '/authorized',
                    authorizer: {
                      name: 'someAuthorizer',
                      scopes: 'foo',
                    },
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      }).then(({ awsNaming, cfTemplate, fixtureData }) => {
        const { Resources } = cfTemplate;
        cfApi = Resources[awsNaming.getHttpApiLogicalId()];
        cfIntegration = Resources[awsNaming.getHttpApiIntegrationLogicalId('foo')];
        cfStage = Resources[awsNaming.getHttpApiStageLogicalId()];
        cfLogGroup = Resources[awsNaming.getHttpApiLogGroupLogicalId()];
        cfCors = cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
        serviceConfig = fixtureData.serviceConfig;
      })
    );

    it('should support `provider.httpApi.name`', () => {
      expect(cfApi.Properties.Name).to.equal('TestHttpApi');
    });

    it('should support `provider.tags`', () => {
      const providerConfig = serviceConfig.provider;

      const expectedTags = providerConfig.tags;
      const { Tags } = cfApi.Properties;
      expect(Tags).to.be.a('object');
      expect(Tags).to.deep.equal(expectedTags);

      const { Tags: stageTags } = cfStage.Properties;
      expect(stageTags).to.be.a('object');
      expect(stageTags).to.deep.equal(expectedTags);
    });

    it('should set payload format version', () => {
      expect(cfIntegration.Type).to.equal('AWS::ApiGatewayV2::Integration');
      expect(cfIntegration.Properties.IntegrationType).to.equal('AWS_PROXY');
      expect(cfIntegration.Properties.PayloadFormatVersion).to.equal('1.0');
    });

    it('should configure detailed metrics', () => {
      expect(cfStage.Properties.DefaultRouteSettings.DetailedMetricsEnabled).to.equal(true);
    });

    it('should configure log group resource', () => {
      expect(cfLogGroup.Type).to.equal('AWS::Logs::LogGroup');
      expect(cfLogGroup.Properties).to.have.property('LogGroupName');
      expect(cfLogGroup.Properties).to.have.property('RetentionInDays');
    });

    it('should setup logs format on stage', () => {
      expect(cfStage.Properties.AccessLogSettings).to.have.property('Format');
    });

    it('should support `provider.httpApi.disableDefaultEndpoint`', () => {
      expect(cfApi.Properties.DisableExecuteApiEndpoint).to.equal(true);
    });

    describe('Cors', () => {
      describe('`true` configuration', () => {
        it('should not set AllowCredentials', () => expect(cfCors.AllowCredentials).to.equal());
        it('should include default set of headers at AllowHeaders', () =>
          expect(cfCors.AllowHeaders).to.include('Content-Type'));
        it('should include "OPTIONS" method at AllowMethods', () =>
          expect(cfCors.AllowMethods).to.include('OPTIONS'));
        it('should include used method at AllowMethods', () => {
          expect(cfCors.AllowMethods).to.include('GET');
          expect(cfCors.AllowMethods).to.include('POST');
        });
        it('should not include not used method at AllowMethods', () => {
          expect(cfCors.AllowMethods).to.not.include('PATCH');
          expect(cfCors.AllowMethods).to.not.include('DELETE');
        });
        it('should allow all origins at AllowOrigins', () =>
          expect(cfCors.AllowOrigins).to.include('*'));
        it('should not set ExposeHeaders', () => expect(cfCors.ExposeHeaders).to.equal());
        it('should not set MaxAge', () => expect(cfCors.MaxAge).to.equal());
      });

      describe('Object configuration #1', () => {
        before(() =>
          runServerless({
            fixture: 'httpApi',
            configExt: {
              provider: {
                httpApi: {
                  cors: {
                    allowedOrigins: 'https://serverless.com',
                    exposedResponseHeaders: ['Content-Length', 'X-Kuma-Revision'],
                  },
                },
              },
            },
            command: 'package',
          }).then(({ awsNaming, cfTemplate }) => {
            cfCors =
              cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
          })
        );
        it('should not set AllowCredentials', () => expect(cfCors.AllowCredentials).to.equal());
        it('should include default set of headers at AllowHeaders', () =>
          expect(cfCors.AllowHeaders).to.include('Content-Type'));
        it('should include "OPTIONS" method at AllowMethods', () =>
          expect(cfCors.AllowMethods).to.include('OPTIONS'));
        it('should include used method at AllowMethods', () => {
          expect(cfCors.AllowMethods).to.include('GET');
          expect(cfCors.AllowMethods).to.include('POST');
        });
        it('should not include not used method at AllowMethods', () => {
          expect(cfCors.AllowMethods).to.not.include('PATCH');
          expect(cfCors.AllowMethods).to.not.include('DELETE');
        });
        it('should respect allowedOrigins', () =>
          expect(cfCors.AllowOrigins).to.deep.equal(['https://serverless.com']));
        it('should respect exposedResponseHeaders', () =>
          expect(cfCors.ExposeHeaders).to.deep.equal(['Content-Length', 'X-Kuma-Revision']));
        it('should not set MaxAge', () => expect(cfCors.MaxAge).to.equal());
      });

      describe('Object configuration #2', () => {
        before(() =>
          runServerless({
            fixture: 'httpApi',
            configExt: {
              provider: {
                httpApi: {
                  cors: {
                    allowCredentials: true,
                    allowedHeaders: ['Authorization'],
                    allowedMethods: ['GET'],
                    maxAge: 300,
                  },
                },
              },
            },
            command: 'package',
          }).then(({ awsNaming, cfTemplate }) => {
            cfCors =
              cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
          })
        );
        it('should respect allowCredentials', () => expect(cfCors.AllowCredentials).to.equal(true));
        it('should respect allowedHeaders', () =>
          expect(cfCors.AllowHeaders).to.deep.equal(['Authorization']));
        it('should respect allowedMethods', () =>
          expect(cfCors.AllowMethods).to.deep.equal(['GET']));
        it('should fallback AllowOrigins to default', () =>
          expect(cfCors.AllowOrigins).to.include('*'));
        it('should not set ExposeHeaders', () => expect(cfCors.ExposeHeaders).to.equal());
        it('should respect maxAge', () => expect(cfCors.MaxAge).to.equal(300));
      });

      describe('With a catch-all route', () => {
        before(() =>
          runServerless({
            fixture: 'httpApiCatchAll',
            configExt: {
              provider: {
                httpApi: {
                  cors: true,
                },
              },
            },
            command: 'package',
          }).then(({ awsNaming, cfTemplate }) => {
            cfCors =
              cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
          })
        );
        it('should respect all allowedMethods', () =>
          expect(cfCors.AllowMethods.sort()).to.deep.equal(
            ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'HEAD', 'DELETE'].sort()
          ));
      });
    });
  });

  describe('Authorizers: REQUEST (Custom Lambda Authorizer)', () => {
    let cfResources;
    let naming;

    before(async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'httpApi',
        configExt: {
          provider: {
            httpApi: {
              authorizers: {
                someAuthorizer: {
                  type: 'request',
                  identitySource: '$request.header.Authorization',
                  functionName: 'other',
                  resultTtlInSeconds: 300,
                  enableSimpleResponses: true,
                  payloadVersion: '2.0',
                },
                authorizerWithExternalFunction: {
                  type: 'request',
                  identitySource: '$request.header.Authorization',
                  functionArn: 'arn:aws:lambda:us-east-2:xxx:function:my-function:1',
                  resultTtlInSeconds: 300,
                  enableSimpleResponses: true,
                  payloadVersion: '2.0',
                  managedExternally: true,
                },
              },
            },
          },
          functions: {
            foo: {
              events: [
                {
                  httpApi: {
                    authorizer: {
                      name: 'someAuthorizer',
                    },
                  },
                },
              ],
            },
            anotherFunc: {
              handler: 'index.handler',
              events: [
                {
                  httpApi: {
                    authorizer: {
                      name: 'authorizerWithExternalFunction',
                    },
                    method: 'get',
                    path: '/anotherfunc',
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      cfResources = cfTemplate.Resources;
      naming = awsNaming;
    });

    it('should configure authorizer resource that references function from service', () => {
      expect(cfResources[naming.getHttpApiAuthorizerLogicalId('someAuthorizer')]).to.deep.equal({
        Type: 'AWS::ApiGatewayV2::Authorizer',
        Properties: {
          ApiId: { Ref: naming.getHttpApiLogicalId() },
          AuthorizerPayloadFormatVersion: '2.0',
          AuthorizerResultTtlInSeconds: 300,
          AuthorizerType: 'REQUEST',
          EnableSimpleResponses: true,
          IdentitySource: ['$request.header.Authorization'],
          Name: 'someAuthorizer',
          AuthorizerUri: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                {
                  'Fn::GetAtt': ['OtherLambdaFunction', 'Arn'],
                },
                '/invocations',
              ],
            ],
          },
        },
      });
    });

    it('should setup authorizer properties on an endpoint configured', () => {
      const routeResourceProps =
        cfResources[naming.getHttpApiRouteLogicalId('GET /foo')].Properties;

      expect(routeResourceProps.AuthorizationType).to.equal('CUSTOM');
      expect(routeResourceProps.AuthorizerId).to.deep.equal({
        Ref: naming.getHttpApiAuthorizerLogicalId('someAuthorizer'),
      });
    });

    it('should create permission resource when authorizer references function from service', () => {
      const authorizerPermissionLogicalId =
        naming.getLambdaAuthorizerHttpApiPermissionLogicalId('someAuthorizer');
      expect(cfResources[authorizerPermissionLogicalId]).to.deep.equal({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::GetAtt': ['OtherLambdaFunction', 'Arn'],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
          SourceArn: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':execute-api:',
                { Ref: 'AWS::Region' },
                ':',
                { Ref: 'AWS::AccountId' },
                ':',
                { Ref: naming.getHttpApiLogicalId() },
                '/*',
              ],
            ],
          },
        },
      });
    });

    it('should configure authorizer resource that references function outside of service', () => {
      expect(
        cfResources[naming.getHttpApiAuthorizerLogicalId('authorizerWithExternalFunction')]
      ).to.deep.equal({
        Type: 'AWS::ApiGatewayV2::Authorizer',
        Properties: {
          ApiId: { Ref: naming.getHttpApiLogicalId() },
          AuthorizerPayloadFormatVersion: '2.0',
          AuthorizerResultTtlInSeconds: 300,
          AuthorizerType: 'REQUEST',
          EnableSimpleResponses: true,
          IdentitySource: ['$request.header.Authorization'],
          Name: 'authorizerWithExternalFunction',
          AuthorizerUri: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':apigateway:',
                { Ref: 'AWS::Region' },
                ':lambda:path/2015-03-31/functions/',
                'arn:aws:lambda:us-east-2:xxx:function:my-function:1',
                '/invocations',
              ],
            ],
          },
        },
      });
    });

    it('should setup authorizer properties on an endpoint configured for authorizer that references function outside of service', () => {
      const routeResourceProps =
        cfResources[naming.getHttpApiRouteLogicalId('GET /anotherfunc')].Properties;

      expect(routeResourceProps.AuthorizationType).to.equal('CUSTOM');
      expect(routeResourceProps.AuthorizerId).to.deep.equal({
        Ref: naming.getHttpApiAuthorizerLogicalId('authorizerWithExternalFunction'),
      });
    });

    it('should not create permission resource when authorizer references externally managed function', () => {
      const authorizerPermissionLogicalId = naming.getLambdaAuthorizerHttpApiPermissionLogicalId(
        'authorizerWithExternalFunction'
      );
      expect(cfResources[authorizerPermissionLogicalId]).to.be.undefined;
    });

    it('should correctly set `DependsOn` property on permission resource for functions with provisioned concurrency', async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'httpApi',
        configExt: {
          provider: {
            httpApi: {
              authorizers: {
                someAuthorizer: {
                  type: 'request',
                  identitySource: '$request.header.Authorization',
                  functionName: 'other',
                  resultTtlInSeconds: 300,
                  enableSimpleResponses: true,
                  payloadVersion: '2.0',
                },
              },
            },
          },
          functions: {
            other: {
              provisionedConcurrency: 1,
            },
            foo: {
              events: [
                {
                  httpApi: {
                    authorizer: {
                      name: 'someAuthorizer',
                    },
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      const authorizerPermissionLogicalId =
        awsNaming.getLambdaAuthorizerHttpApiPermissionLogicalId('someAuthorizer');
      expect(cfTemplate.Resources[authorizerPermissionLogicalId]).to.deep.equal({
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::Join': [
              ':',
              [
                {
                  'Fn::GetAtt': ['OtherLambdaFunction', 'Arn'],
                },
                'provisioned',
              ],
            ],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'apigateway.amazonaws.com',
          SourceArn: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':execute-api:',
                { Ref: 'AWS::Region' },
                ':',
                { Ref: 'AWS::AccountId' },
                ':',
                { Ref: naming.getHttpApiLogicalId() },
                '/*',
              ],
            ],
          },
        },
        DependsOn: 'OtherProvConcLambdaAlias',
      });
    });

    it('should throw when request authorizer does not have "functionName" and "functionArn" defined', async () => {
      await expect(
        runServerless({
          fixture: 'httpApi',
          configExt: {
            provider: {
              httpApi: {
                authorizers: {
                  someAuthorizer: {
                    type: 'request',
                  },
                },
              },
            },
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        name: 'someAuthorizer',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'HTTP_API_CUSTOM_AUTHORIZER_NEITHER_FUNCTION_ARN_NOR_FUNCTION_NAME_DEFINED'
      );
    });

    it('should throw when request authorizer have both "functionName" and "functionArn" defined', async () => {
      await expect(
        runServerless({
          fixture: 'httpApi',
          configExt: {
            provider: {
              httpApi: {
                authorizers: {
                  someAuthorizer: {
                    type: 'request',
                    functionName: 'bar',
                    functionArn: 'arn:xxxx',
                  },
                },
              },
            },
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        name: 'someAuthorizer',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'HTTP_API_CUSTOM_AUTHORIZER_BOTH_FUNCTION_ARN_AND_FUNCTION_NAME_DEFINED'
      );
    });

    it('should throw when request authorizer have both references "functionName" not defined in service', async () => {
      await expect(
        runServerless({
          fixture: 'httpApi',
          configExt: {
            provider: {
              httpApi: {
                authorizers: {
                  someAuthorizer: {
                    type: 'request',
                    functionName: 'notdefined',
                  },
                },
              },
            },
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        name: 'someAuthorizer',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'HTTP_API_CUSTOM_AUTHORIZER_FUNCTION_NOT_FOUND_IN_SERVICE'
      );
    });

    it('should throw when request authorizer has caching enabled but does not have "identitySource" defined', async () => {
      await expect(
        runServerless({
          fixture: 'httpApi',
          configExt: {
            provider: {
              httpApi: {
                authorizers: {
                  someAuthorizer: {
                    type: 'request',
                    functionName: 'other',
                    resultTtlInSeconds: 300,
                  },
                },
              },
            },
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        name: 'someAuthorizer',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'HTTP_API_CUSTOM_AUTHORIZER_IDENTITY_SOURCE_MISSING_WHEN_CACHING_ENABLED'
      );
    });

    it('should throw when authorizer with `request` type does not have name or id configured', async () => {
      await expect(
        runServerless({
          fixture: 'httpApi',
          configExt: {
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        type: 'request',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'HTTP_API_AUTHORIZER_MISSING_ID_OR_NAME'
      );
    });
  });

  describe('Authorizers: JWT', () => {
    let cfResources;
    let naming;
    before(() =>
      runServerless({
        fixture: 'httpApi',
        configExt: {
          provider: {
            httpApi: {
              authorizers: {
                someAuthorizer: {
                  identitySource: '$request.header.Authorization',
                  issuerUrl: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
                  audience: 'audiencexxx',
                },
              },
            },
          },
          functions: {
            foo: {
              events: [
                {
                  httpApi: {
                    authorizer: {
                      name: 'someAuthorizer',
                      scopes: 'foo',
                    },
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      }).then(({ awsNaming, cfTemplate }) => {
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
      })
    );

    it('should configure authorizer resource', () => {
      expect(cfResources[naming.getHttpApiAuthorizerLogicalId('someAuthorizer')]).to.deep.equal({
        Type: 'AWS::ApiGatewayV2::Authorizer',
        Properties: {
          ApiId: { Ref: naming.getHttpApiLogicalId() },
          AuthorizerType: 'JWT',
          IdentitySource: ['$request.header.Authorization'],
          JwtConfiguration: {
            Audience: ['audiencexxx'],
            Issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
          },
          Name: 'someAuthorizer',
        },
      });
    });

    it('should setup authorizer properties on an endpoint', () => {
      const routeResourceProps =
        cfResources[naming.getHttpApiRouteLogicalId('GET /foo')].Properties;

      expect(routeResourceProps.AuthorizationType).to.equal('JWT');
      expect(routeResourceProps.AuthorizationScopes).to.deep.equal(['foo']);
    });

    it('should throw when authorizer with `jwt` type does not have name or id configured', async () => {
      await expect(
        runServerless({
          fixture: 'httpApi',
          configExt: {
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        type: 'jwt',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'HTTP_API_AUTHORIZER_MISSING_ID_OR_NAME'
      );
    });
  });

  describe('Authorizers: AWS_IAM', () => {
    it('should setup correct properties on an endpoint', async () => {
      const { awsNaming, cfTemplate } = await runServerless({
        fixture: 'httpApi',
        configExt: {
          functions: {
            foo: {
              events: [
                {
                  httpApi: {
                    authorizer: {
                      type: 'aws_iam',
                    },
                  },
                },
              ],
            },
          },
        },
        command: 'package',
      });
      const routeResourceProps =
        cfTemplate.Resources[awsNaming.getHttpApiRouteLogicalId('GET /foo')].Properties;

      expect(routeResourceProps.AuthorizationType).to.equal('AWS_IAM');
    });

    it('should throw when authorizer with `aws_iam` type receives additional properties', async () => {
      await expect(
        runServerless({
          fixture: 'httpApi',
          configExt: {
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        type: 'aws_iam',
                        name: 'something',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        })
      ).to.eventually.be.rejected.and.have.property(
        'code',
        'HTTP_API_AUTHORIZER_AWS_IAM_UNEXPECTED_PROPERTIES'
      );
    });
  });

  describe('External authorizers', () => {
    const apiId = 'external-http-api';
    describe('correct configuration', () => {
      let cfResources;
      let naming;
      before(async () => {
        const { awsNaming, cfTemplate } = await runServerless({
          fixture: 'httpApi',
          configExt: {
            provider: { httpApi: { id: apiId } },
            functions: {
              foo: {
                events: [
                  {
                    httpApi: {
                      authorizer: {
                        type: 'jwt',
                        id: 'externalAuthorizer',
                        scopes: 'foo',
                      },
                    },
                  },
                  {
                    httpApi: {
                      method: 'get',
                      path: '/requestauthorizer',
                      authorizer: {
                        id: 'externalRequestAuthorizer',
                        type: 'request',
                      },
                    },
                  },
                ],
              },
            },
          },
          command: 'package',
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
      });

      it('should setup authorizer properties on an endpoint for JWT authorizer', () => {
        const routeResourceProps =
          cfResources[naming.getHttpApiRouteLogicalId('GET /foo')].Properties;

        expect(routeResourceProps.AuthorizerId).to.equal('externalAuthorizer');
        expect(routeResourceProps.AuthorizationType).to.equal('JWT');
        expect(routeResourceProps.AuthorizationScopes).to.deep.equal(['foo']);
      });

      it('should setup authorizer properties on an endpoint for REQUEST authorizer', () => {
        const routeResourceProps =
          cfResources[naming.getHttpApiRouteLogicalId('GET /requestauthorizer')].Properties;

        expect(routeResourceProps.AuthorizerId).to.equal('externalRequestAuthorizer');
        expect(routeResourceProps.AuthorizationType).to.equal('CUSTOM');
      });
    });

    describe('disallowed configurations', () => {
      it('should not allow external authorizer without external httpApi', () => {
        return expect(
          runServerless({
            fixture: 'httpApi',
            configExt: {
              functions: {
                foo: {
                  events: [
                    {
                      httpApi: {
                        authorizer: {
                          id: 'externalAuthorizer',
                          scopes: 'foo',
                        },
                      },
                    },
                  ],
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejected.and.have.property(
          'code',
          'EXTERNAL_HTTP_API_AUTHORIZER_WITHOUT_EXTERNAL_HTTP_API'
        );
      });
    });
  });

  describe('External HTTP API', () => {
    let cfResources;
    let cfOutputs;
    let naming;
    const apiId = 'external-api-id';

    describe('correct configuration', () => {
      before(() =>
        runServerless({
          fixture: 'httpApi',
          configExt: { provider: { httpApi: { id: apiId } } },
          command: 'package',
        }).then(({ awsNaming, cfTemplate }) => {
          ({ Resources: cfResources, Outputs: cfOutputs } = cfTemplate);
          naming = awsNaming;
        })
      );

      it('should not configure API resource', () => {
        expect(cfResources).to.not.have.property(naming.getHttpApiLogicalId());
      });
      it('should not configure stage resource', () => {
        expect(cfResources).to.not.have.property(naming.getHttpApiStageLogicalId());
      });
      it('should not configure output', () => {
        expect(cfOutputs).to.not.have.property('HttpApiId');
        expect(cfOutputs).to.not.have.property('HttpApiUrl');
      });
      it('should configure endpoint that attaches to external API', () => {
        const routeKey = 'POST /some-post';
        const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
        expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
        expect(resource.Properties.RouteKey).to.equal(routeKey);
        expect(resource.Properties.ApiId).to.equal(apiId);
      });
      it('should configure endpoint integration', () => {
        const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
        expect(resource.Type).to.equal('AWS::ApiGatewayV2::Integration');
        expect(resource.Properties.IntegrationType).to.equal('AWS_PROXY');
      });
      it('should configure lambda permissions', () => {
        const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('foo')];
        expect(resource.Type).to.equal('AWS::Lambda::Permission');
        expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
      });
    });

    describe('disallowed configurations', () => {
      it('should not allow defined cors rules', () => {
        return expect(
          runServerless({
            fixture: 'httpApi',
            configExt: {
              provider: {
                httpApi: {
                  id: apiId,
                  cors: true,
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejected.and.have.property('code', 'EXTERNAL_HTTP_API_CORS_CONFIG');
      });
      it('should not allow defined authorizers', () => {
        return expect(
          runServerless({
            fixture: 'httpApi',
            configExt: {
              provider: {
                httpApi: {
                  id: apiId,
                  authorizers: {
                    someAuthorizer: {
                      identitySource: '$request.header.Authorization',
                      issuerUrl: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx',
                      audience: 'audiencexxx',
                    },
                  },
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejected.and.have.property(
          'code',
          'EXTERNAL_HTTP_API_AUTHORIZERS_CONFIG'
        );
      });
      it('should not allow defined logs', () => {
        return expect(
          runServerless({
            fixture: 'httpApi',
            configExt: {
              provider: {
                httpApi: {
                  id: apiId,
                },
                logs: {
                  httpApi: true,
                },
              },
            },
            command: 'package',
          })
        ).to.eventually.be.rejected.and.have.property('code', 'EXTERNAL_HTTP_API_LOGS_CONFIG');
      });
    });
  });

  it('should trigger a deprecation when `provider.httpApi.useProviderTags` is set', async () => {
    await expect(
      runServerless({
        fixture: 'httpApi',
        configExt: {
          provider: {
            httpApi: {
              useProviderTags: true,
            },
          },
        },
        command: 'package',
      })
    ).to.eventually.be.rejected.and.have.property(
      'code',
      'REJECTED_DEPRECATION_AWS_HTTP_API_USE_PROVIDER_TAGS_PROPERTY'
    );
  });
});
