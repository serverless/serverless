'use strict';

const _ = require('lodash');
const { expect } = require('chai');
const log = require('log').get('serverless:test');
const awsRequest = require('@serverless/test/aws-request');
const fixtures = require('../../fixtures');

const { getTmpDirPath } = require('../../utils/fs');
const {
  createTestService,
  deployService,
  removeService,
  fetch,
} = require('../../utils/integration');

describe('HTTP API Integration Test', function() {
  this.timeout(1000 * 60 * 20); // Involves time-taking deploys
  let serviceName;
  let endpoint;
  let stackName;
  let tmpDirPath;
  const stage = 'dev';

  const resolveEndpoint = async () => {
    const result = await awsRequest('CloudFormation', 'describeStacks', { StackName: stackName });
    const endpointOutput = _.find(result.Stacks[0].Outputs, { OutputKey: 'HttpApiUrl' })
      .OutputValue;
    endpoint = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
  };

  describe('Specific endpoints', () => {
    before(async () => {
      tmpDirPath = getTmpDirPath();
      log.debug('temporary path %s', tmpDirPath);
      const serverlessConfig = await createTestService(tmpDirPath, {
        templateDir: fixtures.map.httpApiNoCatchAll,
      });
      serviceName = serverlessConfig.service;
      stackName = `${serviceName}-${stage}`;
      log.notice('deploying %s service', serviceName);
      await deployService(tmpDirPath);
      return resolveEndpoint();
    });

    after(async () => {
      log.notice('Removing service...');
      await removeService(tmpDirPath);
    });

    it('should expose an accessible GET HTTP endpoint', async () => {
      const testEndpoint = `${endpoint}/foo`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/dev/foo' });
    });

    it('should expose an accessible POST HTTP endpoint', async () => {
      const testEndpoint = `${endpoint}/some-post`;

      const response = await fetch(testEndpoint, { method: 'POST' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'POST', path: '/dev/some-post' });
    });

    it('should expose an accessible paramed GET HTTP endpoint', async () => {
      const testEndpoint = `${endpoint}/bar/whatever`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/dev/bar/whatever' });
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

  describe('Catch-all endpoints', () => {
    before(async () => {
      tmpDirPath = getTmpDirPath();
      log.debug('temporary path %s', tmpDirPath);
      const serverlessConfig = await createTestService(tmpDirPath, {
        templateDir: fixtures.map.httpApiCatchAll,
      });
      serviceName = serverlessConfig.service;
      stackName = `${serviceName}-${stage}`;
      log.notice('deploying %s service', serviceName);
      await deployService(tmpDirPath);
      return resolveEndpoint();
    });

    after(async () => {
      log.notice('Removing service...');
      await removeService(tmpDirPath);
    });

    it('should catch all root endpoint', async () => {
      const testEndpoint = `${endpoint}`;

      const response = await fetch(testEndpoint, { method: 'GET' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'GET', path: '/dev' });
    });

    it('should catch all whatever endpoint', async () => {
      const testEndpoint = `${endpoint}/whatever`;

      const response = await fetch(testEndpoint, { method: 'PATCH' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'PATCH', path: '/dev/whatever' });
    });

    it('should catch all methods on method catch all endpoint', async () => {
      const testEndpoint = `${endpoint}/foo`;

      const response = await fetch(testEndpoint, { method: 'PATCH' });
      const json = await response.json();
      expect(json).to.deep.equal({ method: 'PATCH', path: '/dev/foo' });
    });
  });
});
