'use strict';

const path = require('path');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');
const _ = require('lodash');
const fetch = require('node-fetch');

const Utils = require('../../../../../utils/index');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(CF, { suffix: 'Promised' });

describe('AWS - API Gateway (Integration: Lambda): Simple API test', function () {
  this.timeout(0);

  let stackName;
  let endpoint;

  before(() => {
    stackName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should expose the endpoint(s) in the CloudFormation Outputs', () =>
    CF.describeStacksPromised({ StackName: stackName })
      .then((result) => _.find(result.Stacks[0].Outputs,
        { OutputKey: 'ServiceEndpoint' }).OutputValue)
      .then((endpointOutput) => {
        endpoint = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
        endpoint = `${endpoint}`;
      })
  );

  describe('when having a "without-slash" path setup', () => {
    it('should expose an accessible POST HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/without-slash`;

      return fetch(testEndpoint, { method: 'POST' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible GET HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/without-slash`;

      return fetch(testEndpoint)
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible PUT HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/without-slash`;

      return fetch(testEndpoint, { method: 'PUT' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible DELETE HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/without-slash`;

      return fetch(testEndpoint, { method: 'DELETE' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });
  });

  describe('when having a "/with-slash" path setup', () => {
    it('should expose an accessible POST HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/with-slash`;

      return fetch(testEndpoint, { method: 'POST' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible GET HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/with-slash`;

      return fetch(testEndpoint)
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible PUT HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/with-slash`;

      return fetch(testEndpoint, { method: 'PUT' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible DELETE HTTP endpoint', () => {
      const testEndpoint = `${endpoint}/with-slash`;

      return fetch(testEndpoint, { method: 'DELETE' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });
  });

  describe('when having a "/" path setup', () => {
    it('should expose an accessible POST HTTP endpoint', () => {
      const testEndpoint = `${endpoint}`;

      return fetch(testEndpoint, { method: 'POST' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible GET HTTP endpoint', () => {
      const testEndpoint = `${endpoint}`;

      return fetch(testEndpoint)
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible PUT HTTP endpoint', () => {
      const testEndpoint = `${endpoint}`;

      return fetch(testEndpoint, { method: 'PUT' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });

    it('should expose an accessible DELETE HTTP endpoint', () => {
      const testEndpoint = `${endpoint}`;

      return fetch(testEndpoint, { method: 'DELETE' })
        .then(response => response.json())
        .then((json) => expect(json.message).to.equal('Hello from API Gateway!'));
    });
  });

  after(() => {
    Utils.removeService();
  });
});
