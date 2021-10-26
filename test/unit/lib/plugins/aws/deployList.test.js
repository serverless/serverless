'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;
const AwsDeployList = require('../../../../../lib/plugins/aws/deployList');
const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const Serverless = require('../../../../../lib/Serverless');

describe('AwsDeployList', () => {
  let serverless;
  let provider;
  let awsDeployList;
  let s3Key;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless({ commands: [], options: {} });
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'listDeployments';
    const prefix = provider.getDeploymentPrefix();
    s3Key = `${prefix}/${serverless.service.service}/${provider.getStage()}`;
    awsDeployList = new AwsDeployList(serverless, options);
    awsDeployList.bucketName = 'deployment-bucket';
  });

  describe('#listDeployments()', () => {
    it('should print no deployments in case there are none', async () => {
      const s3Response = {
        Contents: [],
      };
      const listObjectsStub = sinon.stub(awsDeployList.provider, 'request').resolves(s3Response);

      await awsDeployList.listDeployments();
      expect(listObjectsStub.calledOnce).to.be.equal(true);
      expect(
        listObjectsStub.calledWithExactly('S3', 'listObjectsV2', {
          Bucket: awsDeployList.bucketName,
          Prefix: `${s3Key}`,
        })
      ).to.be.equal(true);
      awsDeployList.provider.request.restore();
    });

    it('should display all available deployments', async () => {
      const s3Response = {
        Contents: [
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip` },
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/cloudformation.json` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/artifact.zip` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/cloudformation.json` },
        ],
      };

      const listObjectsStub = sinon.stub(awsDeployList.provider, 'request').resolves(s3Response);

      await awsDeployList.listDeployments();
      expect(listObjectsStub.calledOnce).to.be.equal(true);
      expect(
        listObjectsStub.calledWithExactly('S3', 'listObjectsV2', {
          Bucket: awsDeployList.bucketName,
          Prefix: `${s3Key}`,
        })
      ).to.be.equal(true);
      awsDeployList.provider.request.restore();
    });
  });

  describe('#listFunctions()', () => {
    let getFunctionsStub;
    let getFunctionVersionsStub;
    let displayFunctionsStub;

    beforeEach(() => {
      getFunctionsStub = sinon.stub(awsDeployList, 'getFunctions').resolves();
      getFunctionVersionsStub = sinon.stub(awsDeployList, 'getFunctionVersions').resolves();
      displayFunctionsStub = sinon.stub(awsDeployList, 'displayFunctions').resolves();
    });

    afterEach(() => {
      awsDeployList.getFunctions.restore();
      awsDeployList.getFunctionVersions.restore();
      awsDeployList.displayFunctions.restore();
    });

    it('should run promise chain in order', async () => {
      await awsDeployList.listFunctions();

      expect(getFunctionsStub.calledOnce).to.equal(true);
      expect(getFunctionVersionsStub.calledAfter(getFunctionsStub)).to.equal(true);
      expect(displayFunctionsStub.calledAfter(getFunctionVersionsStub)).to.equal(true);
    });
  });

  describe('#getFunctions()', () => {
    let listFunctionsStub;

    beforeEach(() => {
      awsDeployList.serverless.service.functions = {
        func1: {
          name: 'listDeployments-dev-func1',
        },
        func2: {
          name: 'listDeployments-dev-func2',
        },
      };
      listFunctionsStub = sinon.stub(awsDeployList.provider, 'request');
      listFunctionsStub.onCall(0).resolves({
        Configuration: {
          FunctionName: 'listDeployments-dev-func1',
        },
      });
      listFunctionsStub.onCall(1).resolves({
        Configuration: {
          FunctionName: 'listDeployments-dev-func2',
        },
      });
    });

    afterEach(() => {
      awsDeployList.provider.request.restore();
    });

    it('should get all service related functions', async () => {
      const expectedResult = [
        { FunctionName: 'listDeployments-dev-func1' },
        { FunctionName: 'listDeployments-dev-func2' },
      ];

      const result = await awsDeployList.getFunctions();

      expect(listFunctionsStub.callCount).to.equal(2);
      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe('#getFunctionPaginatedVersions()', () => {
    beforeEach(() => {
      sinon
        .stub(awsDeployList.provider, 'request')
        .onFirstCall()
        .resolves({
          Versions: [{ FunctionName: 'listDeployments-dev-func', Version: '1' }],
          NextMarker: '123',
        })
        .onSecondCall()
        .resolves({
          Versions: [{ FunctionName: 'listDeployments-dev-func', Version: '2' }],
        });
    });

    afterEach(() => {
      awsDeployList.provider.request.restore();
    });

    it('should return the versions for the provided function when response is paginated', async () => {
      const params = {
        FunctionName: 'listDeployments-dev-func',
      };

      const result = await awsDeployList.getFunctionPaginatedVersions(params);
      const expectedResult = {
        Versions: [
          { FunctionName: 'listDeployments-dev-func', Version: '1' },
          { FunctionName: 'listDeployments-dev-func', Version: '2' },
        ],
      };

      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe('#getFunctionVersions()', () => {
    let listVersionsByFunctionStub;

    beforeEach(() => {
      listVersionsByFunctionStub = sinon.stub(awsDeployList.provider, 'request').resolves({
        Versions: [{ FunctionName: 'listDeployments-dev-func', Version: '$LATEST' }],
      });
    });

    afterEach(() => {
      awsDeployList.provider.request.restore();
    });

    it('should return the versions for the provided functions', async () => {
      const funcs = [
        { FunctionName: 'listDeployments-dev-func1' },
        { FunctionName: 'listDeployments-dev-func2' },
      ];

      const result = await awsDeployList.getFunctionVersions(funcs);
      const expectedResult = [
        {
          Versions: [{ FunctionName: 'listDeployments-dev-func', Version: '$LATEST' }],
        },
        {
          Versions: [{ FunctionName: 'listDeployments-dev-func', Version: '$LATEST' }],
        },
      ];

      expect(listVersionsByFunctionStub.calledTwice).to.equal(true);
      expect(result).to.deep.equal(expectedResult);
    });
  });
});
