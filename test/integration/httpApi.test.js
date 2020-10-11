'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const awsRequest = require('@serverless/test/aws-request');
const fixtures = require('../fixtures');
const { confirmCloudWatchLogs } = require('../utils/misc');

const { deployService, removeService, fetch } = require('../utils/integration');

describe('HTTP API Integration Test', function() {
  this.timeout(1000 * 60 * 20); // Involves time-taking deploys
  let endpoint;
  let stackName;
  let servicePath;
  const stage = 'dev';

  const resolveEndpoint = async () => {
    const result = await awsRequest('CloudFormation', 'describeStacks', { StackName: stackName });
    const endpointOutput = result.Stacks[0].Outputs.find(
      output => output.OutputKey === 'HttpApiUrl'
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
        await awsRequest('CognitoIdentityServiceProvider', 'createUserPool', {
          PoolName: `test-http-api-${process.hrtime()[1]}`,
        })
      ).UserPool.Id;
      [clientId] = await Promise.all([
        awsRequest('CognitoIdentityServiceProvider', 'createUserPoolClient', {
          ClientName: 'test-http-api',
          UserPoolId: poolId,
          ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
          PreventUserExistenceErrors: 'ENABLED',
        }).then(result => result.UserPoolClient.ClientId),
        awsRequest('CognitoIdentityServiceProvider', 'adminCreateUser', {
          UserPoolId: poolId,
          Username: userName,
        }).then(() =>
          awsRequest('CognitoIdentityServiceProvider', 'adminSetUserPassword', {
            UserPoolId: poolId,
            Username: userName,
            Password: userPassword,
            Permanent: true,
          })
        ),
      ]);

      const serviceData = await fixtures.setup('httpApi', {
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
          },
        },
      });
      ({ servicePath } = serviceData);
      const serviceName = serviceData.serviceConfig.service;
      stackName = `${serviceName}-${stage}`;
      await deployService(servicePath);
      return resolveEndpoint();
    });

    after(async () => {
      await awsRequest('CognitoIdentityServiceProvider', 'deleteUserPool', { UserPoolId: poolId });
      if (!servicePath) return;
      await removeService(servicePath);
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
        await awsRequest('CognitoIdentityServiceProvider', 'initiateAuth', {
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

    it('should expose access logs when configured to', () =>
      confirmCloudWatchLogs(`/aws/http-api/${stackName}`, async () => {
        const response = await fetch(`${endpoint}/some-post`, { method: 'POST' });
        await response.json();
      }).then(events => {
        expect(events.length > 0).to.equal(true);
      }));
  });

  describe('Catch-all endpoints', () => {
    before(async () => {
      const serviceData = await fixtures.setup('httpApiCatchAll');
      ({ servicePath } = serviceData);
      const serviceName = serviceData.serviceConfig.service;
      stackName = `${serviceName}-${stage}`;
      await deployService(servicePath);
      return resolveEndpoint();
    });

    after(async function() {
      // Added temporarily to inspect random fails
      // TODO: Remove once properly diagnosed
      if (this.test.parent.tests.some(test => test.state === 'failed')) return;
      log.notice('Removing service...');
      await removeService(servicePath);
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
      const exportServiceData = await fixtures.setup('httpApiExport');
      ({ servicePath: exportServicePath } = exportServiceData);
      const exportServiceName = exportServiceData.serviceConfig.service;
      await deployService(exportServicePath);
      const httpApiId = (
        await awsRequest('CloudFormation', 'describeStacks', {
          StackName: `${exportServiceName}-${stage}`,
        })
      ).Stacks[0].Outputs[0].OutputValue;
      endpoint = (await awsRequest('ApiGatewayV2', 'getApi', { ApiId: httpApiId })).ApiEndpoint;

      const serviceData = await fixtures.setup('httpApi', {
        configExt: {
          provider: { httpApi: { id: httpApiId } },
        },
      });
      ({ servicePath } = serviceData);
      serviceName = serviceData.serviceConfig.service;
      stackName = `${serviceName}-${stage}`;
      await deployService(servicePath);
    });

    after(async () => {
      if (serviceName) {
        await removeService(servicePath);
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
