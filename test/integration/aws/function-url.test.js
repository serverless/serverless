'use strict';

const { expect } = require('chai');
const awsRequest = require('@serverless/test/aws-request');
const CloudFormationService = require('aws-sdk').CloudFormation;
const fixtures = require('../../fixtures/programmatic');
const aws4 = require('aws4');
const url = require('url');

const { deployService, removeService, fetch } = require('../../utils/integration');

describe('test/integration/aws/function-url.test.js', function () {
  this.timeout(1000 * 60 * 10); // Involves time-taking deploys
  let stackName;
  let serviceDir;
  let basicEndpoint;
  let otherEndpoint;
  let authedEndpoint;
  const stage = 'dev';

  before(async () => {
    const serviceData = await fixtures.setup('function', {
      configExt: {
        functions: {
          basic: {
            url: true,
          },
          other: {
            url: {
              cors: {
                exposedResponseHeaders: ['x-foo'],
                allowCredentials: true,
                allowedMethods: ['GET'],
              },
            },
          },
          authed: {
            handler: 'basic.handler',
            url: {
              authorizer: 'aws_iam',
            },
          },
        },
      },
    });
    ({ servicePath: serviceDir } = serviceData);
    const serviceName = serviceData.serviceConfig.service;
    stackName = `${serviceName}-${stage}`;
    await deployService(serviceDir);
    const describeStacksResponse = await awsRequest(CloudFormationService, 'describeStacks', {
      StackName: stackName,
    });
    basicEndpoint = describeStacksResponse.Stacks[0].Outputs.find(
      (output) => output.OutputKey === 'BasicLambdaFunctionUrl'
    ).OutputValue;
    otherEndpoint = describeStacksResponse.Stacks[0].Outputs.find(
      (output) => output.OutputKey === 'OtherLambdaFunctionUrl'
    ).OutputValue;
    authedEndpoint = describeStacksResponse.Stacks[0].Outputs.find(
      (output) => output.OutputKey === 'AuthedLambdaFunctionUrl'
    ).OutputValue;
  });

  after(async () => {
    if (!serviceDir) return;
    await removeService(serviceDir);
  });

  it('should return valid response from Lambda URL', async () => {
    const expectedMessage = 'Basic';

    const response = await fetch(basicEndpoint, { method: 'GET' });
    const jsonResponse = await response.json();
    expect(jsonResponse.message).to.equal(expectedMessage);
  });

  it('should return valid response from Lambda URL with authorizer with valid signature', async () => {
    const expectedMessage = 'Basic';
    const signedParams = aws4.sign(
      {
        service: 'lambda',
        region: 'us-east-1',
        method: 'GET',
        host: url.parse(authedEndpoint).hostname,
      },
      {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    );

    const response = await fetch(authedEndpoint, signedParams);
    const jsonResponse = await response.json();
    expect(jsonResponse.message).to.equal(expectedMessage);
  });

  it('should return invalid response from Lambda URL with authorizer without passed signature', async () => {
    const expectedMessage = 'Forbidden';
    const response = await fetch(authedEndpoint, { method: 'GET' });
    const jsonResponse = await response.json();
    expect(jsonResponse.Message).to.equal(expectedMessage);
  });

  it('should return expected CORS headers from Lambda URL', async () => {
    const response = await fetch(otherEndpoint, {
      method: 'GET',
      headers: { Origin: 'https://serverless.com' },
    });
    const headers = response.headers;
    expect(headers.get('access-control-expose-headers')).to.equal('x-foo');
    expect(headers.get('access-control-allow-credentials')).to.equal('true');
  });
});
