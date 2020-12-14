'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

const { expect } = chai;

describe('lib/plugins/aws/package/compile/events/httpApi.test.js', () => {
  it('should not configure HTTP API resources when no events are configured', () =>
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      cliArgs: ['package'],
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
        cliArgs: ['package'],
        configExt: {
          functions: {
            catchAll: { handler: 'index.handler', events: [{ httpApi: '*' }] },
            methodCatchAll: {
              handler: 'index.handler',
              events: [{ httpApi: { method: '*', path: '/method-catch-all' } }],
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

    it('should configure output', () => {
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

    it('should ensure higher timeout than function', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
      expect(resource.Properties.TimeoutInMillis).to.equal(6500);
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
  });

  describe('Provider properties', () => {
    let cfApi;
    let cfStage;
    let cfIntegration;
    let cfLogGroup;
    let cfCors;

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
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        const { Resources } = cfTemplate;
        cfApi = Resources[awsNaming.getHttpApiLogicalId()];
        cfIntegration = Resources[awsNaming.getHttpApiIntegrationLogicalId('foo')];
        cfStage = Resources[awsNaming.getHttpApiStageLogicalId()];
        cfLogGroup = Resources[awsNaming.getHttpApiLogGroupLogicalId()];
        cfCors = cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
      })
    );

    it('should support `provider.httpApi.name`', () => {
      expect(cfApi.Properties.Name).to.equal('TestHttpApi');
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
            cliArgs: ['package'],
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
            cliArgs: ['package'],
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
            cliArgs: ['package'],
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
        cliArgs: ['package'],
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
  });

  describe('External authorizers: JWT', () => {
    const apiId = 'external-http-api';
    describe('correct configuration', () => {
      let cfResources;
      let naming;
      before(() =>
        runServerless({
          fixture: 'httpApi',
          configExt: {
            provider: { httpApi: { id: apiId } },
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
          cliArgs: ['package'],
        }).then(({ awsNaming, cfTemplate }) => {
          cfResources = cfTemplate.Resources;
          naming = awsNaming;
        })
      );

      it('should setup authorizer properties on an endpoint', () => {
        const routeResourceProps =
          cfResources[naming.getHttpApiRouteLogicalId('GET /foo')].Properties;

        expect(routeResourceProps.AuthorizerId).to.equal('externalAuthorizer');
        expect(routeResourceProps.AuthorizationType).to.equal('JWT');
        expect(routeResourceProps.AuthorizationScopes).to.deep.equal(['foo']);
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
            cliArgs: ['package'],
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
          cliArgs: ['package'],
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
            cliArgs: ['package'],
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
            cliArgs: ['package'],
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
            cliArgs: ['package'],
          })
        ).to.eventually.be.rejected.and.have.property('code', 'EXTERNAL_HTTP_API_LOGS_CONFIG');
      });
    });
  });
});
