'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const awsRequest = require('@serverless/test/aws-request');
const CloudFormationService = require('aws-sdk').CloudFormation;
const CognitoIdentityServiceProviderService = require('aws-sdk').CognitoIdentityServiceProvider;
const ApiGatewayV2Service = require('aws-sdk').ApiGatewayV2;
const fixtures = require('../../fixtures/programmatic');
const { confirmCloudWatchLogs } = require('../../utils/misc');

const { deployService, removeService, fetch } = require('../../utils/integration');

describe('HTTP API Integration Test', function () {
  this.timeout(1000 * 60 * 20); // Involves time-taking deploys
  let endpoint;
  let stackName;
  let serviceDir;
  const stage = 'dev';

  const resolveEndpoint = async () => {
    const result = await awsRequest(CloudFormationService, 'describeStacks', {
      StackName: stackName,
    });
    const endpointOutput = result.Stacks[0].Outputs.find(
      (output) => output.OutputKey === 'HttpApiUrl'
    ).OutputValue;
    endpoint = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com/)[0];
  };

  describe('Specific endpoints', () => {
    let poolId;
    let clientId;
    const userName = 'test-http-api';
    const userPassword = 'razDwa3!';

    before(async () => {
      poolId = (
        await awsRequest(CognitoIdentityServiceProviderService, 'createUserPool', {
          PoolName: `test-http-api-${process.hrtime()[1]}`,
        })
      ).UserPool.Id;
      [clientId] = await Promise.all([
        awsRequest(CognitoIdentityServiceProviderService, 'createUserPoolClient', {
          ClientName: 'test-http-api',
          UserPoolId: poolId,
          ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
          PreventUserExistenceErrors: 'ENABLED',
        }).then((result) => result.UserPoolClient.ClientId),
        awsRequest(CognitoIdentityServiceProviderService, 'adminCreateUser', {
          UserPoolId: poolId,
          Username: userName,
        }).then(() =>
          awsRequest(CognitoIdentityServiceProviderService, 'adminSetUserPassword', {
            UserPoolId: poolId,
            Username: userName,
            Password: userPassword,
            Permanent: true,
          })
        ),
      ]);

      const serviceData = await fixtures.setup('http-api', {
        configExt: {
          provider: {
            httpApi: {
              cors: { exposedResponseHeaders: 'X-foo' },
              authorizers: {
                someAuthorizer: {
                  identitySource: '$request.header.Authorization',
                  issuerUrl: `https://cognito-idp.us-east-1.amazonaws.com/${poolId}`,
                  audience: clientId,
                },
                simpleCustomLambdaAuthorizer: {
                  type: 'request',
                  functionName: 'simpleCustomAuthorizer',
                  enableSimpleResponses: true,
                },
                standardCustomLambdaAuthorizer: {
                  type: 'request',
                  functionName: 'standardCustomAuthorizer',
                },
              },
            },
            logs: { httpApi: true },
          },
          functions: {
            foo: {
              events: [
                {
                  httpApi: {
                    authorizer: 'someAuthorizer',
                  },
                },
              ],
            },
            other: {
              timeout: 1,
            },
            behindSimpleCustomAuthorizer: {
              handler: 'index.handler',
              events: [
                {
                  httpApi: {
                    method: 'GET',
                    path: '/behind-simple-authorizer',
                    authorizer: 'simpleCustomLambdaAuthorizer',
                  },
                },
              ],
            },
            behindStandardCustomAuthorizer: {
              handler: 'index.handler',
              events: [
                {
                  httpApi: {
                    method: 'GET',
                    path: '/behind-standard-authorizer',
                    authorizer: 'standardCustomLambdaAuthorizer',
                  },
                },
              ],
            },
          },
        },
      });
      ({ servicePath: serviceDir } = serviceData);
      const serviceName = serviceData.serviceConfig.service;
      stackName = `${serviceName}-${stage}`;
      await deployService(serviceDir);
      return resolveEndpoint();
    });

    after(async () => {
      await awsRequest(CognitoIdentityServiceProviderService, 'deleteUserPool', {
        UserPoolId: poolId,
      });
      if (!serviceDir) return;
      await removeService(serviceDir);
    });

    it('should expose an accessible POST HTTP endpoint', async () => {
      const testEndpoint = `${endpoint}/some-post`;

      const response = await fetch(testEndpoint, { method: 'POST' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'POST', path: '/some-post' });
    });

    it('should expose an accessible paramed GET HTTP endpoint', async () => {
      const testEndpoint = `${endpoint}/bar/whatever`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/bar/whatever' });
    });

    it('should return 404 on not supported method', async () => {
      const testEndpoint = `${endpoint}/foo`;

      const response = await fetch(testEndpoint, { method: 'POST' });
      expect(response.status).to.equal(404);
    });

    it('should return 404 on not configured path', async () => {
      const testEndpoint = `${endpoint}/not-configured`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      expect(response.status).to.equal(404);
    });

    it('should respect timeout settings', async () => {
      const testEndpoint = `${endpoint}/bar/timeout`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      expect(response.status).to.equal(500);
    });

    it('should support CORS when indicated', async () => {
      const testEndpoint = `${endpoint}/bar/whatever`;

      const response = await fetch(testEndpoint, {
        method: 'GET',
        headers: { Origin: 'https://serverless.com' },
      });
      expect(response.headers.get('access-control-allow-origin')).to.equal('*');
      expect(response.headers.get('access-control-expose-headers')).to.equal('x-foo');
    });

    it('should expose a GET HTTP endpoint backed by JWT authorization', async () => {
      const testEndpoint = `${endpoint}/foo`;

      const responseUnauthorized = await fetch(testEndpoint, {
        method: 'GET',
      });
      expect(responseUnauthorized.status).to.equal(401);

      const token = (
        await awsRequest(CognitoIdentityServiceProviderService, 'initiateAuth', {
          AuthFlow: 'USER_PASSWORD_AUTH',
          AuthParameters: { USERNAME: userName, PASSWORD: userPassword },
          ClientId: clientId,
        })
      ).AuthenticationResult.IdToken;
      const responseAuthorized = await fetch(testEndpoint, {
        method: 'GET',
        headers: { Authorization: token },
      });
      const json = await responseAuthorized.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/foo' });
    });

    it('should expose a GET HTTP endpoint backed by simple custom request authorization', async () => {
      const testEndpoint = `${endpoint}/behind-simple-authorizer`;

      const responseUnauthorized = await fetch(testEndpoint, {
        method: 'GET',
      });
      expect(responseUnauthorized.status).to.equal(403);

      const responseAuthorized = await fetch(testEndpoint, {
        method: 'GET',
        headers: { Authorization: 'secretToken' },
      });
      const json = await responseAuthorized.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/behind-simple-authorizer' });
    });

    it('should expose a GET HTTP endpoint backed by standard custom request authorization', async () => {
      const testEndpoint = `${endpoint}/behind-standard-authorizer`;

      const responseUnauthorized = await fetch(testEndpoint, {
        method: 'GET',
      });
      expect(responseUnauthorized.status).to.equal(403);

      const responseAuthorized = await fetch(testEndpoint, {
        method: 'GET',
        headers: { Authorization: 'secretToken' },
      });
      const json = await responseAuthorized.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/behind-standard-authorizer' });
    });

    it('should expose access logs when configured to', () =>
      confirmCloudWatchLogs(`/aws/http-api/${stackName}`, async () => {
        const response = await fetch(`${endpoint}/some-post`, { method: 'POST' });
        await response.json();
      }).then((events) => {
        expect(events.length > 0).to.equal(true);
      }));
  });

  describe('Catch-all endpoints', () => {
    before(async () => {
      const serviceData = await fixtures.setup('http-api-catch-all');
      ({ servicePath: serviceDir } = serviceData);
      const serviceName = serviceData.serviceConfig.service;
      stackName = `${serviceName}-${stage}`;
      await deployService(serviceDir);
      return resolveEndpoint();
    });

    after(async function () {
      if (this.test.parent.tests.some((test) => test.state === 'failed')) return;
      log.notice('Removing service...');
      await removeService(serviceDir);
    });

    it('should catch all root endpoint', async () => {
      const testEndpoint = `${endpoint}`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/' });
    });

    it('should catch all whatever endpoint', async () => {
      const testEndpoint = `${endpoint}/whatever`;

      const response = await fetch(testEndpoint, { method: 'PATCH' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'PATCH', path: '/whatever' });
    });

    it('should catch all methods on method catch all endpoint', async () => {
      const testEndpoint = `${endpoint}/foo`;

      const response = await fetch(testEndpoint, { method: 'PATCH' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'PATCH', path: '/foo' });
    });
  });

  describe('Shared API', () => {
    let exportServicePath;
    let serviceName;

    before(async () => {
      const exportServiceData = await fixtures.setup('http-api-export');
      ({ servicePath: exportServicePath } = exportServiceData);
      const exportServiceName = exportServiceData.serviceConfig.service;
      await deployService(exportServicePath);
      const httpApiId = (
        await awsRequest(CloudFormationService, 'describeStacks', {
          StackName: `${exportServiceName}-${stage}`,
        })
      ).Stacks[0].Outputs[0].OutputValue;
      endpoint = (await awsRequest(ApiGatewayV2Service, 'getApi', { ApiId: httpApiId }))
        .ApiEndpoint;

      const serviceData = await fixtures.setup('http-api', {
        configExt: {
          provider: { httpApi: { id: httpApiId } },
        },
      });
      ({ servicePath: serviceDir } = serviceData);
      serviceName = serviceData.serviceConfig.service;
      stackName = `${serviceName}-${stage}`;
      await deployService(serviceDir);
    });

    after(async () => {
      if (serviceName) {
        await removeService(serviceDir);
      }
      await removeService(exportServicePath);
    });

    it('should expose an accessible POST HTTP endpoint', async () => {
      const testEndpoint = `${endpoint}/some-post`;

      const response = await fetch(testEndpoint, { method: 'POST' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'POST', path: '/some-post' });
    });

    it('should expose an accessible paramed GET HTTP endpoint', async () => {
      const testEndpoint = `${endpoint}/bar/whatever`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/bar/whatever' });
    });

    it('should return 404 on not supported method', async () => {
      const testEndpoint = `${endpoint}/foo`;

      const response = await fetch(testEndpoint, { method: 'POST' });
      expect(response.status).to.equal(404);
    });

    it('should return 404 on not configured path', async () => {
      const testEndpoint = `${endpoint}/not-configured`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      expect(response.status).to.equal(404);
    });
  });
});
