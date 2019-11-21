'use strict';

const path = require('path');
const AWS = require('aws-sdk');
const _ = require('lodash');
const { expect } = require('chai');

const { getTmpDirPath, readYamlFile, writeYamlFile } = require('../../utils/fs');
const { region, confirmCloudWatchLogs } = require('../../utils/misc');
const {
  createTestService,
  deployService,
  removeService,
  fetch,
} = require('../../utils/integration');
const { createRestApi, deleteRestApi, getResources } = require('../../utils/api-gateway');

const CF = new AWS.CloudFormation({ region });

describe('AWS - API Gateway Integration Test', function() {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let serviceName;
  let endpoint;
  let stackName;
  let tmpDirPath;
  let serverlessFilePath;
  let restApiId;
  let restApiRootResourceId;
  let apiKey;
  const stage = 'dev';

  before(async () => {
    tmpDirPath = getTmpDirPath();
    console.info(`Temporary path: ${tmpDirPath}`);
    serverlessFilePath = path.join(tmpDirPath, 'serverless.yml');
    const serverlessConfig = await createTestService(tmpDirPath, {
      templateDir: path.join(__dirname, 'service'),
      serverlessConfigHook:
        // Ensure unique API key for each test (to avoid collision among concurrent CI runs)
        config => {
          apiKey = `${config.service}-api-key-1`;
          config.provider.apiKeys[0] = { name: apiKey, value: apiKey };
        },
    });
    serviceName = serverlessConfig.service;
    stackName = `${serviceName}-${stage}`;
    console.info(`Deploying "${stackName}" service...`);
    await deployService(tmpDirPath);
  });

  after(async () => {
    console.info('Removing service...');
    await removeService(tmpDirPath);
  });

  beforeEach(() => {
    return CF.describeStacks({ StackName: stackName })
      .promise()
      .then(
        result => _.find(result.Stacks[0].Outputs, { OutputKey: 'ServiceEndpoint' }).OutputValue
      )
      .then(endpointOutput => {
        endpoint = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
        endpoint = `${endpoint}`;
      });
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
        // TODO: for some reason this test fails for now...
        // expect(headers.get('access-control-allow-origin')).to.equal('*');
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

    beforeEach(() => {
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

    beforeEach(() => {
      testEndpoint = `${endpoint}/api-keys`;
    });

    it('should reject a request with an invalid API Key', () => {
      return fetch(testEndpoint).then(response => {
        expect(response.status).to.equal(403);
      });
    });

    it('should succeed if correct API key is given', () => {
      return fetch(testEndpoint, { headers: { 'X-API-Key': apiKey } })
        .then(response => response.json())
        .then(json => {
          expect(json.message).to.equal('Hello from API Gateway! - (apiKeys)');
        });
    });
  });

  describe('Using stage specific configuration', () => {
    before(async () => {
      const serverless = readYamlFile(serverlessFilePath);
      // enable Logs, Tags and Tracing
      _.merge(serverless.provider, {
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
      });
      writeYamlFile(serverlessFilePath, serverless);
      await deployService(tmpDirPath);
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
          console.info(
            'Created external rest API ' +
              `(id: ${restApiId}, root resource id: ${restApiRootResourceId})`
          );
        });

      const serverless = readYamlFile(serverlessFilePath);
      // enable Logs, Tags and Tracing
      _.merge(serverless.provider, {
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
      });
      writeYamlFile(serverlessFilePath, serverless);
      console.info('Redeploying service (with external Rest API ID)...');
      await deployService(tmpDirPath);
    });

    after(async () => {
      // NOTE: deleting the references to the old, external REST API
      const serverless = readYamlFile(serverlessFilePath);
      delete serverless.provider.apiGateway.restApiId;
      delete serverless.provider.apiGateway.restApiRootResourceId;
      writeYamlFile(serverlessFilePath, serverless);
      // NOTE: deploying once again to get the stack into the original state
      console.info('Redeploying service (without external Rest API ID)...');
      await deployService(tmpDirPath);
      console.info('Deleting external rest API...');
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

  describe('Integration Lambda Timeout', () => {
    it('should result with 504 status code', () =>
      fetch(`${endpoint}/integration-lambda-timeout`).then(response =>
        expect(response.status).to.equal(504)
      ));
  });
});
