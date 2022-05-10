'use strict';

const { expect } = require('chai');
const log = require('log').get('serverless:test');
const awsRequest = require('@serverless/test/aws-request');
const CloudFormationService = require('aws-sdk').CloudFormation;
const fixtures = require('../../fixtures/programmatic');

const { deployService, removeService, fetch } = require('../../utils/integration');
const { createRestApi, deleteRestApi, getResources } = require('../../utils/api-gateway');

describe('AWS - API Gateway with External REST API Integration Test', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let endpoint;
  let updateConfig;
  let stackName;
  let serviceDir;
  let isDeployed = false;
  let restApiId;
  const stage = 'dev';

  const resolveEndpoint = async () => {
    const result = await awsRequest(CloudFormationService, 'describeStacks', {
      StackName: stackName,
    });
    const endpointOutput = result.Stacks[0].Outputs.find(
      (output) => output.OutputKey === 'ServiceEndpoint'
    ).OutputValue;
    endpoint = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
  };

  before(async () => {
    const serviceData = await fixtures.setup('api-gateway');
    ({ servicePath: serviceDir, updateConfig } = serviceData);
    const serviceName = serviceData.serviceConfig.service;
    const externalRestApiName = `${stage}-${serviceName}-ext-api`;
    const restApiMeta = await createRestApi(externalRestApiName);
    restApiId = restApiMeta.id;
    const resources = await getResources(restApiId);
    const restApiRootResourceId = resources[0].id;
    log.notice(
      'Created external rest API ' +
        `(id: ${restApiId}, root resource id: ${restApiRootResourceId})`
    );
    await updateConfig({
      provider: {
        apiGateway: {
          restApiId,
          restApiRootResourceId,
        },
      },
    });
    stackName = `${serviceName}-${stage}`;
    await deployService(serviceDir);
    isDeployed = true;
    return resolveEndpoint();
  });

  after(async () => {
    if (!isDeployed) return;
    log.notice('Removing service...');
    await removeService(serviceDir);
    log.notice('Deleting external rest API...');
    await deleteRestApi(restApiId);
  });

  it('should expose an accessible GET HTTP endpoint', () => {
    return fetch(endpoint, { method: 'GET' })
      .then((response) => response.json())
      .then((json) => expect(json.message).to.equal('Hello from API Gateway! - (minimal)'));
  });

  it('should expose an accessible POST HTTP endpoint', () => {
    const testEndpoint = `${endpoint}/minimal-1`;

    return fetch(testEndpoint, { method: 'POST' })
      .then((response) => response.json())
      .then((json) => expect(json.message).to.equal('Hello from API Gateway! - (minimal)'));
  });
});
