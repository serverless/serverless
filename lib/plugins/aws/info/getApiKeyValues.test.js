'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');

describe('#getApiKeyValues()', () => {
  let serverless;
  let awsInfo;
  let requestStub;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.service.service = 'my-service';
    awsInfo = new AwsInfo(serverless, options);
    requestStub = sinon.stub(awsInfo.provider, 'request');
  });

  afterEach(() => {
    awsInfo.provider.request.restore();
  });

  it('should add API Key values to this.gatheredData if API key names are available', () => {
    // set the API Keys for the service
    awsInfo.serverless.service.provider.apiKeys = ['foo', 'bar'];

    awsInfo.gatheredData = {
      info: {},
    };

    const apiKeyItems = {
      items: [
        {
          id: '4711',
          name: 'SomeRandomIdInUsersAccount',
          value: 'ShouldNotBeConsidered',
        },
        {
          id: '1234',
          name: 'foo',
          value: 'valueForKeyFoo',
        },
        {
          id: '5678',
          name: 'bar',
          value: 'valueForKeyBar',
        },
      ],
    };

    requestStub.resolves(apiKeyItems);

    const expectedGatheredDataObj = {
      info: {
        apiKeys: [
          {
            name: 'foo',
            value: 'valueForKeyFoo',
          },
          {
            name: 'bar',
            value: 'valueForKeyBar',
          },
        ],
      },
    };

    return awsInfo.getApiKeyValues().then(() => {
      expect(requestStub.calledOnce).to.equal(true);
      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });

  it('should resolve if AWS does not return API key values', () => {
    // set the API Keys for the service
    awsInfo.serverless.service.provider.apiKeys = ['foo', 'bar'];

    awsInfo.gatheredData = {
      info: {},
    };

    const apiKeyItems = {
      items: [],
    };

    requestStub.resolves(apiKeyItems);

    const expectedGatheredDataObj = {
      info: {
        apiKeys: [],
      },
    };

    return awsInfo.getApiKeyValues().then(() => {
      expect(requestStub.calledOnce).to.equal(true);
      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });

  it('should resolve if API key names are not available', () => {
    awsInfo.serverless.service.provider.apiKeys = null;

    awsInfo.gatheredData = {
      info: {},
    };

    const expectedGatheredDataObj = {
      info: {
        apiKeys: [],
      },
    };

    return awsInfo.getApiKeyValues().then(() => {
      expect(requestStub.calledOnce).to.equal(false);
      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });
});
