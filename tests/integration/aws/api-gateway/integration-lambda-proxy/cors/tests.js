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

describe('AWS - API Gateway (Integration: Lambda Proxy): CORS test', () => {
  let stackName;
  let endpointBase;

  beforeAll(() => {
    stackName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should expose the endpoint(s) in the CloudFormation Outputs', () =>
    CF.describeStacksPromised({ StackName: stackName })
      .then((result) => _.find(result.Stacks[0].Outputs,
        { OutputKey: 'ServiceEndpoint' }).OutputValue)
      .then((endpointOutput) => {
        endpointBase = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
      })
  );

  it('should setup CORS support with simple string config', () =>
    fetch(`${endpointBase}/simple-cors`, { method: 'OPTIONS' })
      .then((response) => {
        const headers = response.headers;

        expect(headers.get('access-control-allow-headers'))
          .to.equal('Content-Type,X-Amz-Date,Authorization,X-Api-Key,'
            + 'X-Amz-Security-Token,X-Amz-User-Agent');
        expect(headers.get('access-control-allow-methods')).to.equal('OPTIONS,GET');
        expect(headers.get('access-control-allow-origin')).to.equal('*');
      })
  );

  it('should setup CORS support with complex object config', () =>
    fetch(`${endpointBase}/complex-cors`, { method: 'OPTIONS' })
      .then((response) => {
        const headers = response.headers;

        expect(headers.get('access-control-allow-headers'))
          .to.equal('Content-Type,X-Amz-Date,Authorization,X-Api-Key,'
            + 'X-Amz-Security-Token,X-Amz-User-Agent');
        expect(headers.get('access-control-allow-methods')).to.equal('OPTIONS,GET');
        expect(headers.get('access-control-allow-origin')).to.equal('*');
      })
  );

  afterAll(() => {
    Utils.removeService();
  });
});
