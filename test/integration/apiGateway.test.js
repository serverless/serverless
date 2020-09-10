'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const awsRequest = require('@serverless/test/aws-request');
const fixtures = require('../fixtures');

const { confirmCloudWatchLogs } = require('../utils/misc');
const { deployService, removeService, fetch } = require('../utils/integration');
const { createRestApi, deleteRestApi, getResources } = require('../utils/apiGateway');

describe('AWS - API Gateway Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let endpoint;
  let stackName;
  let servicePath;
  let updateConfig;
  let restApiId;
  let restApiRootResourceId;
  let apiKey;
  let isDeployed = false;
  const stage = 'dev';

  const resolveEndpoint = async () => {
    const result = await awsRequest('CloudFormation', 'describeStacks', { StackName: stackName });
    const endpointOutput = result.Stacks[0].Outputs.find(
      output => output.OutputKey === 'ServiceEndpoint'
    ).OutputValue;
    endpoint = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
  };

  before(async () => {
    const serviceData = await fixtures.setup('apiGatewayExtended');
    ({ servicePath, updateConfig } = serviceData);
    serviceName = serviceData.serviceConfig.service;
    apiKey = `${serviceName}-api-key-1`;
    stackName = `${serviceName}-${stage}`;
    await deployService(servicePath);
    isDeployed = true;
    return resolveEndpoint();
  });

  after(async () => {
    if (!isDeployed) return;
    log.notice('Removing service...');
    await removeService(servicePath);
  });

  describe('Minimal Setup', () => {
    const expectedMessage = 'Hello from API Gateway! - (minimal)';

    it('should expose an accessible GET HTTP endpoint', () => {
      const testEndpoint = `${endpoint}`;

      return fetch(testEndpoint, { method: 'GET' })
        .then(response => response.json())
        .then(json => expect(json.message).to.equal(expectedMessage));
    });

    it('should expose an accessible POST HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/minimal-1`;

      return fetch(testEndpoint, { method: 'POST' })
        .then(response => response.json())
        .then(json => expect(json.message).to.equal(expectedMessage));
    });

    it('should expose an accessible PUT HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/minimal-2`;

      return fetch(testEndpoint, { method: 'PUT' })
        .then(response => response.json())
        .then(json => expect(json.message).to.equal(expectedMessage));
    });

    it('should expose an accessible DELETE HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/minimal-3`;

      return fetch(testEndpoint, { method: 'DELETE' })
        .then(response => response.json())
        .then(json => expect(json.message).to.equal(expectedMessage));
    });
  });

  describe('CORS', () => {
    it('should setup simple CORS support via cors: true config', () => {
      const testEndpoint = `${endpoint}/simple-cors`;

      return fetch(testEndpoint, { method: 'OPTIONS' }).then(response => {
        const headers = response.headers;
        const allowHeaders = [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ].join(',');
        expect(headers.get('access-control-allow-headers')).to.equal(allowHeaders);
        expect(headers.get('access-control-allow-methods')).to.equal('OPTIONS,GET');
        expect(headers.get('access-control-allow-credentials')).to.equal(null);
        expect(headers.get('access-control-allow-origin')).to.equal('*');
      });
    });

    it('should setup CORS support with complex object config', () => {
      const testEndpoint = `${endpoint}/complex-cors`;

      return fetch(testEndpoint, { method: 'OPTIONS' }).then(response => {
        const headers = response.headers;
        const allowHeaders = [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ].join(',');
        expect(headers.get('access-control-allow-headers')).to.equal(allowHeaders);
        expect(headers.get('access-control-allow-methods')).to.equal('OPTIONS,GET');
        expect(headers.get('access-control-allow-credentials')).to.equal('true');
        expect(headers.get('access-control-allow-origin')).to.equal('*');
      });
    });
  });

  describe('Custom Authorizers', () => {
    let testEndpoint;

    before(() => {
      testEndpoint = `${endpoint}/custom-auth`;
    });

    it('should reject requests without authorization', () => {
      return fetch(testEndpoint).then(response => {
        expect(response.status).to.equal(401);
      });
    });

    it('should reject requests with wrong authorization', () => {
      return fetch(testEndpoint, {
        headers: { Authorization: 'Bearer ShouldNotBeAuthorized' },
      }).then(response => {
        expect(response.status).to.equal(401);
      });
    });

    it('should authorize requests with correct authorization', () => {
      return fetch(testEndpoint, { headers: { Authorization: 'Bearer ShouldBeAuthorized' } })
        .then(response => response.json())
        .then(json => {
          expect(json.message).to.equal('Hello from API Gateway! - (customAuthorizers)');
          expect(json.event.requestContext.authorizer.principalId).to.equal('SomeRandomId');
          expect(json.event.headers.Authorization).to.equal('Bearer ShouldBeAuthorized');
        });
    });
  });

  describe('API Keys', () => {
    let testEndpoint;
    let startTime;

    before(() => {
      testEndpoint = `${endpoint}/api-keys`;
      startTime = Date.now();
    });

    it('should succeed if correct API key is given', async function self() {
      const response = await fetch(testEndpoint, { headers: { 'X-API-Key': apiKey } });
      const result = await response.json();
      // API Key may take a moment to propagate, retry
      if (response.status === 403 && startTime > Date.now() - 1000 * 60 * 3) {
        log.notice('API Key rejected, retry');
        return self();
      }
      expect(response.status).to.equal(200);
      expect(result.message).to.equal('Hello from API Gateway! - (apiKeys)');
      return null;
    });

    it('should reject a request with an invalid API Key', () => {
      return fetch(testEndpoint).then(response => {
        expect(response.status).to.equal(403);
      });
    });
  });

  describe('Using stage specific configuration', () => {
    before(async () => {
      await updateConfig({
        provider: {
          tags: {
            foo: 'bar',
            baz: 'qux',
          },
          tracing: {
            apiGateway: true,
          },
          logs: {
            restApi: true,
          },
        },
      });
      await deployService(servicePath);
    });

    it('should update the stage without service interruptions', () => {
      // re-using the endpoint from the "minimal" test case
      const testEndpoint = `${endpoint}`;

      return confirmCloudWatchLogs(
        `/aws/api-gateway/${stackName}`,
        () =>
          fetch(`${testEndpoint}`, { method: 'GET' })
            .then(response => response.json())
            // Confirm that APIGW responds as expected
            .then(json => expect(json.message).to.equal('Hello from API Gateway! - (minimal)'))
        // Confirm that CloudWatch logs for APIGW are written
      ).then(events => expect(events.length > 0).to.equal(true));
    });
  });

  describe('Integration Lambda Timeout', () => {
    it('should result with 504 status code', () =>
      fetch(`${endpoint}/integration-lambda-timeout`).then(response =>
        expect(response.status).to.equal(504)
      ));
  });

  // NOTE: this test should  be at the very end because we're using an external REST API here
  describe('when using an existing REST API with stage specific configuration', () => {
    before(async () => {
      // create an external REST API
      const externalRestApiName = `${stage}-${serviceName}-ext-api`;
      await createRestApi(externalRestApiName)
        .then(restApiMeta => {
          restApiId = restApiMeta.id;
          return getResources(restApiId);
        })
        .then(resources => {
          restApiRootResourceId = resources[0].id;
          log.notice(
            'Created external rest API ' +
              `(id: ${restApiId}, root resource id: ${restApiRootResourceId})`
          );
        });

      await updateConfig({
        provider: {
          apiGateway: {
            restApiId,
            restApiRootResourceId,
          },
          tags: {
            foo: 'bar',
            baz: 'qux',
          },
          tracing: {
            apiGateway: true,
          },
          logs: {
            restApi: true,
          },
        },
      });
      log.notice('Redeploying service (with external Rest API ID)...');
      await deployService(servicePath);
      return resolveEndpoint();
    });

    after(async () => {
      await updateConfig({
        provider: {
          apiGateway: {
            restApiId: null,
            restApiRootResourceId: null,
          },
        },
      });
      // NOTE: deploying once again to get the stack into the original state
      log.notice('Redeploying service (without external Rest API ID)...');
      await deployService(servicePath);
      log.notice('Deleting external rest API...');
      return deleteRestApi(restApiId);
    });

    it('should update the stage without service interruptions', () => {
      // re-using the endpoint from the "minimal" test case
      const testEndpoint = `${endpoint}/minimal-1`;

      return fetch(testEndpoint, { method: 'POST' })
        .then(response => response.json())
        .then(json => expect(json.message).to.equal('Hello from API Gateway! - (minimal)'));
    });
  });
});
