'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');

describe('#getMetrics()', () => {
  let serverless;
  let awsInfo;
  let requestStub;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.service.service = 'my-service';
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsInfo = new AwsInfo(serverless, options);
    requestStub = sinon.stub(awsInfo.provider, 'request');
  });

  afterEach(() => {
    awsInfo.provider.request.restore();
  });

  it('should call add CloudWatch metrics to this.gatheredData if functions are available', () => {
    // invocations
    requestStub.onCall(0).returns(
      BbPromise.resolve({
        ResponseMetadata: { RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755' },
        Label: 'Invocations',
        Datapoints: [],
      })
    );
    // throttles
    requestStub.onCall(1).returns(
      BbPromise.resolve({
        ResponseMetadata: { RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2' },
        Label: 'Throttles',
        Datapoints: [],
      })
    );
    // errors
    requestStub.onCall(2).returns(
      BbPromise.resolve({
        ResponseMetadata: { RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b' },
        Label: 'Errors',
        Datapoints: [],
      })
    );
    // duration
    requestStub.onCall(3).returns(
      BbPromise.resolve({
        ResponseMetadata: { RequestId: '1f63db14-b569-11e6-8501-d98a275ce164' },
        Label: 'Duration',
        Datapoints: [],
      })
    );

    awsInfo.gatheredData = {
      info: {
        functions: [
          {
            arn: 'arn:aws:iam::12345678:function:hello',
            name: 'hello',
          },
        ],
      },
    };

    const expectedGatheredDataObj = {
      info: {
        functions: [
          {
            arn: 'arn:aws:iam::12345678:function:hello',
            name: 'hello',
            metrics: [
              {
                ResponseMetadata: {
                  RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755',
                },
                Label: 'Invocations',
                Datapoints: [],
              },
              {
                ResponseMetadata: {
                  RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2',
                },
                Label: 'Throttles',
                Datapoints: [],
              },
              {
                ResponseMetadata: {
                  RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b',
                },
                Label: 'Errors',
                Datapoints: [],
              },
              {
                ResponseMetadata: {
                  RequestId: '1f63db14-b569-11e6-8501-d98a275ce164',
                },
                Label: 'Duration',
                Datapoints: [],
              },
            ],
          },
        ],
      },
    };

    return awsInfo.getMetrics().then(() => {
      expect(requestStub.callCount).to.equal(4);
      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });

  it('should resolve if no functions are given', () => {
    awsInfo.gatheredData = {
      info: {
        functions: [],
      },
    };

    const expectedGatheredDataObj = {
      info: {
        functions: [],
      },
    };

    return awsInfo.getMetrics().then(() => {
      expect(requestStub.callCount).to.equal(0);
      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj);
    });
  });
});
