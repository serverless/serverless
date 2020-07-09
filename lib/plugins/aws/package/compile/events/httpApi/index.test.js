'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../../../tests/fixtures');

chai.use(require('chai-as-promised'));

const { expect } = chai;

describe('HttpApiEvents', () => {
  after(fixtures.cleanup);

  it('Should not configure HTTP when events are not configured', () =>
    runServerless({
      config: { service: 'irrelevant', provider: 'aws' },
      cliArgs: ['package'],
    }).then(({ serverless }) => {
      const cfResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
      const naming = serverless.getProvider('aws').naming;

      expect(cfResources[naming.getHttpApiLogicalId()]).to.equal();
      expect(cfResources[naming.getHttpApiStageLogicalId()]).to.equal();
    }));

  describe('Specific endpoints', () => {
    let cfResources;
    let cfOutputs;
    let naming;

    before(() =>
      runServerless({
        cwd: fixtures.map.httpApi,
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        ({ Resources: cfResources, Outputs: cfOutputs } = cfTemplate);
        naming = awsNaming;
      })
    );

    it('Should configure API resource', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Api');
      expect(resource.Properties).to.have.property('Name');
      expect(resource.Properties.ProtocolType).to.equal('HTTP');
    });

    it('Should not configure default route', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Properties).to.not.have.property('RouteKey');
      expect(resource.Properties).to.not.have.property('Target');
    });
    it('Should not configure cors when not asked to', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Properties).to.not.have.property('CorsConfiguration');
    });
    it('Should not configure logs when not asked to', () => {
      expect(cfResources).to.not.have.property(naming.getHttpApiLogGroupLogicalId());
    });
    it('Should configure stage resource', () => {
      const resource = cfResources[naming.getHttpApiStageLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Stage');
      expect(resource.Properties.StageName).to.equal('$default');
      expect(resource.Properties.AutoDeploy).to.equal(true);
    });
    it('Should configure output', () => {
      const output = cfOutputs.HttpApiUrl;
      expect(output).to.have.property('Value');
    });
    it('Should configure endpoint', () => {
      const routeKey = 'POST /some-post';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });
    it('Should configure endpoint integration', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Integration');
      expect(resource.Properties.IntegrationType).to.equal('AWS_PROXY');
      expect(resource.Properties.PayloadFormatVersion).to.equal('1.0');
    });
    it('Should ensure higher timeout than function', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
      expect(resource.Properties.TimeoutInMillis).to.equal(6500);
    });

    it('Should configure lambda permissions', () => {
      const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::Lambda::Permission');
      expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
    });
  });

  describe('Custom API name', () => {
    let cfHttpApi;

    before(() =>
      fixtures
        .extend('httpApi', { provider: { httpApi: { name: 'TestHttpApi' } } })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            const { Resources } = cfTemplate;
            cfHttpApi = Resources[awsNaming.getHttpApiLogicalId()];
          })
        )
    );

    it('Should configure API name', () => {
      expect(cfHttpApi.Properties.Name).to.equal('TestHttpApi');
    });
  });

  describe('Payload format version', () => {
    let cfHttpApiIntegration;

    before(() =>
      fixtures.extend('httpApi', { provider: { httpApi: { payload: '2.0' } } }).then(fixturePath =>
        runServerless({
          cwd: fixturePath,
          cliArgs: ['package'],
        }).then(({ awsNaming, cfTemplate: { Resources } }) => {
          cfHttpApiIntegration = Resources[awsNaming.getHttpApiIntegrationLogicalId('foo')];
        })
      )
    );

    it('Should set payload format version', () => {
      expect(cfHttpApiIntegration.Type).to.equal('AWS::ApiGatewayV2::Integration');
      expect(cfHttpApiIntegration.Properties.IntegrationType).to.equal('AWS_PROXY');
      expect(cfHttpApiIntegration.Properties.PayloadFormatVersion).to.equal('2.0');
    });
  });

  describe('Catch-all endpoints', () => {
    let cfResources;
    let cfOutputs;
    let naming;

    before(() =>
      runServerless({
        cwd: fixtures.map.httpApiCatchAll,
        cliArgs: ['package'],
      }).then(({ awsNaming, cfTemplate }) => {
        ({ Resources: cfResources, Outputs: cfOutputs } = cfTemplate);
        naming = awsNaming;
      })
    );

    it('Should configure API resource', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Api');
      expect(resource.Properties).to.have.property('Name');
      expect(resource.Properties.ProtocolType).to.equal('HTTP');
    });

    it('Should not configure default route', () => {
      const resource = cfResources[naming.getHttpApiLogicalId()];
      expect(resource.Properties).to.not.have.property('RouteKey');
      expect(resource.Properties).to.not.have.property('Target');
    });
    it('Should configure default stage resource', () => {
      const resource = cfResources[naming.getHttpApiStageLogicalId()];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Stage');
      expect(resource.Properties.StageName).to.equal('$default');
      expect(resource.Properties.AutoDeploy).to.equal(true);
    });
    it('Should configure output', () => {
      const output = cfOutputs.HttpApiUrl;
      expect(output).to.have.property('Value');
    });
    it('Should configure catch all endpoint', () => {
      const routeKey = '*';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal('$default');
    });
    it('Should configure method catch all endpoint', () => {
      const routeKey = 'ANY /foo';
      const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
      expect(resource.Properties.RouteKey).to.equal(routeKey);
    });
    it('Should configure endpoint integration', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('other')];
      expect(resource.Type).to.equal('AWS::ApiGatewayV2::Integration');
      expect(resource.Properties.IntegrationType).to.equal('AWS_PROXY');
    });
    it('Should configure lambda permissions for global catch all target', () => {
      const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('foo')];
      expect(resource.Type).to.equal('AWS::Lambda::Permission');
      expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
    });
    it('Should configure lambda permissions for path catch all target', () => {
      const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('other')];
      expect(resource.Type).to.equal('AWS::Lambda::Permission');
      expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
    });
  });

  describe('Cors', () => {
    let cfCors;

    describe('`true` configuration', () => {
      before(() =>
        fixtures.extend('httpApi', { provider: { httpApi: { cors: true } } }).then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            cfCors =
              cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
          })
        )
      );
      it('Should not set AllowCredentials', () => expect(cfCors.AllowCredentials).to.equal());
      it('Should include default set of headers at AllowHeaders', () =>
        expect(cfCors.AllowHeaders).to.include('Content-Type'));
      it('Should include "OPTIONS" method at AllowMethods', () =>
        expect(cfCors.AllowMethods).to.include('OPTIONS'));
      it('Should include used method at AllowMethods', () => {
        expect(cfCors.AllowMethods).to.include('GET');
        expect(cfCors.AllowMethods).to.include('POST');
      });
      it('Should not include not used method at AllowMethods', () => {
        expect(cfCors.AllowMethods).to.not.include('PATCH');
        expect(cfCors.AllowMethods).to.not.include('DELETE');
      });
      it('Should allow all origins at AllowOrigins', () =>
        expect(cfCors.AllowOrigins).to.include('*'));
      it('Should not set ExposeHeaders', () => expect(cfCors.ExposeHeaders).to.equal());
      it('Should not set MaxAge', () => expect(cfCors.MaxAge).to.equal());
    });

    describe('Object configuration #1', () => {
      before(() =>
        fixtures
          .extend('httpApi', {
            provider: {
              httpApi: {
                cors: {
                  allowedOrigins: 'https://serverless.com',
                  exposedResponseHeaders: ['Content-Length', 'X-Kuma-Revision'],
                },
              },
            },
          })
          .then(fixturePath =>
            runServerless({
              cwd: fixturePath,
              cliArgs: ['package'],
            }).then(({ awsNaming, cfTemplate }) => {
              cfCors =
                cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
            })
          )
      );
      it('Should not set AllowCredentials', () => expect(cfCors.AllowCredentials).to.equal());
      it('Should include default set of headers at AllowHeaders', () =>
        expect(cfCors.AllowHeaders).to.include('Content-Type'));
      it('Should include "OPTIONS" method at AllowMethods', () =>
        expect(cfCors.AllowMethods).to.include('OPTIONS'));
      it('Should include used method at AllowMethods', () => {
        expect(cfCors.AllowMethods).to.include('GET');
        expect(cfCors.AllowMethods).to.include('POST');
      });
      it('Should not include not used method at AllowMethods', () => {
        expect(cfCors.AllowMethods).to.not.include('PATCH');
        expect(cfCors.AllowMethods).to.not.include('DELETE');
      });
      it('Should respect allowedOrigins', () =>
        expect(cfCors.AllowOrigins).to.deep.equal(['https://serverless.com']));
      it('Should respect exposedResponseHeaders', () =>
        expect(cfCors.ExposeHeaders).to.deep.equal(['Content-Length', 'X-Kuma-Revision']));
      it('Should not set MaxAge', () => expect(cfCors.MaxAge).to.equal());
    });

    describe('Object configuration #2', () => {
      before(() =>
        fixtures
          .extend('httpApi', {
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
          })
          .then(fixturePath =>
            runServerless({
              cwd: fixturePath,
              cliArgs: ['package'],
            }).then(({ awsNaming, cfTemplate }) => {
              cfCors =
                cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
            })
          )
      );
      it('Should respect allowCredentials', () => expect(cfCors.AllowCredentials).to.equal(true));
      it('Should respect allowedHeaders', () =>
        expect(cfCors.AllowHeaders).to.deep.equal(['Authorization']));
      it('Should respect allowedMethods', () => expect(cfCors.AllowMethods).to.deep.equal(['GET']));
      it('Should fallback AllowOrigins to default', () =>
        expect(cfCors.AllowOrigins).to.include('*'));
      it('Should not set ExposeHeaders', () => expect(cfCors.ExposeHeaders).to.equal());
      it('Should respect maxAge', () => expect(cfCors.MaxAge).to.equal(300));
    });

    describe('With a catch-all route', () => {
      before(() =>
        fixtures
          .extend('httpApiCatchAll', {
            provider: {
              httpApi: {
                cors: true,
              },
            },
          })
          .then(fixturePath =>
            runServerless({
              cwd: fixturePath,
              cliArgs: ['package'],
            }).then(({ awsNaming, cfTemplate }) => {
              cfCors =
                cfTemplate.Resources[awsNaming.getHttpApiLogicalId()].Properties.CorsConfiguration;
            })
          )
      );
      it('Should respect all allowedMethods', () =>
        expect(cfCors.AllowMethods.sort()).to.deep.equal(
          ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'HEAD', 'DELETE'].sort()
        ));
    });
  });

  describe('Authorizers: JWT', () => {
    let cfResources;
    let naming;
    before(() =>
      fixtures
        .extend('httpApi', {
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
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            cfResources = cfTemplate.Resources;
            naming = awsNaming;
          })
        )
    );

    it('Should configure authorizer resource', () => {
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

    it('Should setup authorizer properties on an endpoint', () => {
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
        fixtures
          .extend('httpApi', {
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
          })
          .then(fixturePath =>
            runServerless({
              cwd: fixturePath,
              cliArgs: ['package'],
            }).then(({ awsNaming, cfTemplate }) => {
              cfResources = cfTemplate.Resources;
              naming = awsNaming;
            })
          )
      );

      it('Should setup authorizer properties on an endpoint', () => {
        const routeResourceProps =
          cfResources[naming.getHttpApiRouteLogicalId('GET /foo')].Properties;

        expect(routeResourceProps.AuthorizerId).to.equal('externalAuthorizer');
        expect(routeResourceProps.AuthorizationType).to.equal('JWT');
        expect(routeResourceProps.AuthorizationScopes).to.deep.equal(['foo']);
      });
    });

    describe('disallowed configurations', () => {
      it('Should not allow external authorizer without external httpApi', () => {
        return expect(
          fixtures
            .extend('httpApi', {
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
            })
            .then(fixturePath =>
              runServerless({
                cwd: fixturePath,
                cliArgs: ['package'],
              })
            )
        ).to.eventually.be.rejected.and.have.property(
          'code',
          'EXTERNAL_HTTP_API_AUTHORIZER_WITHOUT_EXTERNAL_HTTP_API'
        );
      });
    });
  });

  describe('Access logs', () => {
    let cfResources;
    let naming;
    before(() =>
      fixtures
        .extend('httpApi', {
          provider: {
            logs: {
              httpApi: true,
            },
          },
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            cfResources = cfTemplate.Resources;
            naming = awsNaming;
          })
        )
    );

    it('Should configure log group resource', () => {
      const resource = cfResources[naming.getHttpApiLogGroupLogicalId()];
      expect(resource.Type).to.equal('AWS::Logs::LogGroup');
      expect(resource.Properties).to.have.property('LogGroupName');
      expect(resource.Properties).to.have.property('RetentionInDays');
    });

    it('Should setup logs format on stage', () => {
      const stageResourceProps = cfResources[naming.getHttpApiStageLogicalId()].Properties;

      expect(stageResourceProps.AccessLogSettings).to.have.property('Format');
    });
  });

  describe('External HTTP API', () => {
    let cfResources;
    let cfOutputs;
    let naming;
    const apiId = 'external-api-id';

    describe('correct configuration', () => {
      before(() =>
        fixtures.extend('httpApi', { provider: { httpApi: { id: apiId } } }).then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            ({ Resources: cfResources, Outputs: cfOutputs } = cfTemplate);
            naming = awsNaming;
          })
        )
      );

      it('Should not configure API resource', () => {
        expect(cfResources).to.not.have.property(naming.getHttpApiLogicalId());
      });
      it('Should not configure stage resource', () => {
        expect(cfResources).to.not.have.property(naming.getHttpApiStageLogicalId());
      });
      it('Should not configure output', () => {
        expect(cfOutputs).to.not.have.property('HttpApiUrl');
      });
      it('Should configure endpoint that attaches to external API', () => {
        const routeKey = 'POST /some-post';
        const resource = cfResources[naming.getHttpApiRouteLogicalId(routeKey)];
        expect(resource.Type).to.equal('AWS::ApiGatewayV2::Route');
        expect(resource.Properties.RouteKey).to.equal(routeKey);
        expect(resource.Properties.ApiId).to.equal(apiId);
      });
      it('Should configure endpoint integration', () => {
        const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
        expect(resource.Type).to.equal('AWS::ApiGatewayV2::Integration');
        expect(resource.Properties.IntegrationType).to.equal('AWS_PROXY');
      });
      it('Should configure lambda permissions', () => {
        const resource = cfResources[naming.getLambdaHttpApiPermissionLogicalId('foo')];
        expect(resource.Type).to.equal('AWS::Lambda::Permission');
        expect(resource.Properties.Action).to.equal('lambda:InvokeFunction');
      });
    });

    describe('disallowed configurations', () => {
      it('Should not allow defined cors rules', () => {
        return expect(
          fixtures
            .extend('httpApi', {
              provider: {
                httpApi: {
                  id: apiId,
                  cors: true,
                },
              },
            })
            .then(fixturePath =>
              runServerless({
                cwd: fixturePath,
                cliArgs: ['package'],
              })
            )
        ).to.eventually.be.rejected.and.have.property('code', 'EXTERNAL_HTTP_API_CORS_CONFIG');
      });
      it('Should not allow defined authorizers', () => {
        return expect(
          fixtures
            .extend('httpApi', {
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
            })
            .then(fixturePath =>
              runServerless({
                cwd: fixturePath,
                cliArgs: ['package'],
              })
            )
        ).to.eventually.be.rejected.and.have.property(
          'code',
          'EXTERNAL_HTTP_API_AUTHORIZERS_CONFIG'
        );
      });
      it('Should not allow defined logs', () => {
        return expect(
          fixtures
            .extend('httpApi', {
              provider: {
                httpApi: {
                  id: apiId,
                },
                logs: {
                  httpApi: true,
                },
              },
            })
            .then(fixturePath =>
              runServerless({
                cwd: fixturePath,
                cliArgs: ['package'],
              })
            )
        ).to.eventually.be.rejected.and.have.property('code', 'EXTERNAL_HTTP_API_LOGS_CONFIG');
      });
    });
  });

  describe('Timeout', () => {
    let cfResources;
    let naming;

    before(() =>
      fixtures
        .extend('httpApi', {
          provider: { httpApi: { timeout: 3 } },
          functions: {
            other: {
              events: [
                {
                  httpApi: {
                    timeout: 20.56,
                  },
                },
              ],
            },
          },
        })
        .then(fixturePath =>
          runServerless({
            cwd: fixturePath,
            cliArgs: ['package'],
          }).then(({ awsNaming, cfTemplate }) => {
            ({ Resources: cfResources } = cfTemplate);
            naming = awsNaming;
          })
        )
    );

    it('Should support timeout set at endpoint', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('other')];
      expect(resource.Properties.TimeoutInMillis).to.equal(20560);
    });
    it('Should support globally set timeout', () => {
      const resource = cfResources[naming.getHttpApiIntegrationLogicalId('foo')];
      expect(resource.Properties.TimeoutInMillis).to.equal(3000);
    });
  });
});
