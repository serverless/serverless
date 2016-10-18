'use strict';

const path = require('path');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const execSync = require('child_process').execSync;
const AWS = require('aws-sdk');
const _ = require('lodash');
const fetch = require('node-fetch');

const Utils = require('../../../../../utils/index');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
const APIG = new AWS.APIGateway({ region: 'us-east-1' });
BbPromise.promisifyAll(CF, { suffix: 'Promised' });
BbPromise.promisifyAll(APIG, { suffix: 'Promised' });

describe('AWS - API Gateway (Integration: Lambda): API keys test', () => {
  let stackName;
  let endpoint;
  let apiKey;

  before(function () {
    this.timeout(0);

    stackName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should expose the endpoint(s) in the CloudFormation Outputs', function () {
    this.timeout(0);

    return CF.describeStacksPromised({ StackName: stackName })
      .then((result) => _.find(result.Stacks[0].Outputs,
        { OutputKey: 'ServiceEndpoint' }).OutputValue)
      .then((endpointOutput) => {
        endpoint = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
        endpoint = `${endpoint}/hello`;
      });
  });

  it('should expose the API key(s) with its values when running the info command', function () {
    this.timeout(0);

    const info = execSync(`${Utils.serverlessExec} info`);

    const stringifiedOutput = (new Buffer(info, 'base64').toString());

    // some regex magic to extract the first API key value from the info output
    apiKey = stringifiedOutput.match(/(api keys:\n)(\s*)(.+):(\s*)(.+)/)[5];

    expect(apiKey.length).to.be.above(0);
  });

  it('should reject a request with an invalid API Key', function () {
    this.timeout(0);

    return fetch(endpoint)
      .then((response) => {
        expect(response.status).to.equal(403);
      });
  });

  it('should succeed if correct API key is given', function () {
    this.timeout(0);

    return fetch(endpoint, { headers: { 'x-api-key': apiKey } })
      .then(response => response.json())
      .then((json) => {
        expect(json.message).to.equal('Hello from API Gateway!');
        expect(json.event.identity.apiKey).to.equal(apiKey);
        expect(json.event.headers['x-api-key']).to.equal(apiKey);
      });
  });

  after(function () {
    this.timeout(0);

    Utils.removeService();
  });
});
