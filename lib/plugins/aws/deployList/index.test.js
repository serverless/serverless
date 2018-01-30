'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;
const AwsDeployList = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');

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
    serverless = new Serverless();
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'listDeployments';
    s3Key = `serverless/${serverless.service.service}/${provider.getStage()}`;
    awsDeployList = new AwsDeployList(serverless, options);
    awsDeployList.bucketName = 'deployment-bucket';
    awsDeployList.serverless.cli = {
      log: sinon.spy(),
    };
  });

  describe('#listDeployments()', () => {
    it('should print no deployments in case there are none', () => {
      const s3Response = {
        Contents: [],
      };
      const listObjectsStub = sinon
        .stub(awsDeployList.provider, 'request').resolves(s3Response);

      return awsDeployList.listDeployments().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsDeployList.bucketName,
            Prefix: `${s3Key}`,
          }
        )).to.be.equal(true);
        const infoText = 'Couldn\'t find any existing deployments.';
        expect(awsDeployList.serverless.cli.log.calledWithExactly(infoText)).to.be.equal(true);
        const verifyText = 'Please verify that stage and region are correct.';
        expect(awsDeployList.serverless.cli.log.calledWithExactly(verifyText)).to.be.equal(true);
        awsDeployList.provider.request.restore();
      });
    });

    it('should display all available deployments', () => {
      const s3Response = {
        Contents: [
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip` },
          { Key: `${s3Key}/113304333331-2016-08-18T13:40:06/cloudformation.json` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/artifact.zip` },
          { Key: `${s3Key}/903940390431-2016-08-18T23:42:08/cloudformation.json` },
        ],
      };

      const listObjectsStub = sinon
        .stub(awsDeployList.provider, 'request').resolves(s3Response);

      return awsDeployList.listDeployments().then(() => {
        expect(listObjectsStub.calledOnce).to.be.equal(true);
        expect(listObjectsStub.calledWithExactly(
          'S3',
          'listObjectsV2',
          {
            Bucket: awsDeployList.bucketName,
            Prefix: `${s3Key}`,
          }
        )).to.be.equal(true);
        const infoText = 'Listing deployments:';
        expect(awsDeployList.serverless.cli.log.calledWithExactly(infoText)).to.be.equal(true);
        const timestampOne = 'Timestamp: 113304333331';
        const datetimeOne = 'Datetime: 2016-08-18T13:40:06';
        expect(awsDeployList.serverless.cli.log.calledWithExactly(timestampOne)).to.be.equal(true);
        expect(awsDeployList.serverless.cli.log.calledWithExactly(datetimeOne)).to.be.equal(true);
        const timestampTow = 'Timestamp: 903940390431';
        const datetimeTwo = 'Datetime: 2016-08-18T23:42:08';
        expect(awsDeployList.serverless.cli.log.calledWithExactly(timestampTow)).to.be.equal(true);
        expect(awsDeployList.serverless.cli.log.calledWithExactly(datetimeTwo)).to.be.equal(true);
        awsDeployList.provider.request.restore();
      });
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

    it('should run promise chain in order', () => awsDeployList
      .listFunctions().then(() => {
        expect(getFunctionsStub.calledOnce).to.equal(true);
        expect(getFunctionVersionsStub.calledAfter(getFunctionsStub)).to.equal(true);
        expect(displayFunctionsStub.calledAfter(getFunctionVersionsStub)).to.equal(true);
      })
    );
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

    it('should get all service related functions', () => {
      const expectedResult = [
        { FunctionName: 'listDeployments-dev-func1' },
        { FunctionName: 'listDeployments-dev-func2' },
      ];

      return awsDeployList.getFunctions().then((result) => {
        expect(listFunctionsStub.callCount).to.equal(2);
        expect(result).to.deep.equal(expectedResult);
      });
    });
  });

  describe('#getFunctionPaginatedVersions()', () => {
    beforeEach(() => {
      sinon
        .stub(awsDeployList.provider, 'request')
        .onFirstCall()
        .resolves({
          Versions: [
            { FunctionName: 'listDeployments-dev-func', Version: '1' },
          ],
          NextMarker: '123',
        })
        .onSecondCall()
        .resolves({
          Versions: [
            { FunctionName: 'listDeployments-dev-func', Version: '2' },
          ],
        });
    });

    afterEach(() => {
      awsDeployList.provider.request.restore();
    });

    it('should return the versions for the provided function when response is paginated', () => {
      const params = {
        FunctionName: 'listDeployments-dev-func',
      };

      return awsDeployList.getFunctionPaginatedVersions(params).then((result) => {
        const expectedResult = {
          Versions: [
            { FunctionName: 'listDeployments-dev-func', Version: '1' },
            { FunctionName: 'listDeployments-dev-func', Version: '2' },
          ],
        };

        expect(result).to.deep.equal(expectedResult);
      });
    });
  });

  describe('#getFunctionVersions()', () => {
    let listVersionsByFunctionStub;

    beforeEach(() => {
      listVersionsByFunctionStub = sinon
        .stub(awsDeployList.provider, 'request')
        .resolves({
          Versions: [
            { FunctionName: 'listDeployments-dev-func', Version: '$LATEST' },
          ],
        });
    });

    afterEach(() => {
      awsDeployList.provider.request.restore();
    });

    it('should return the versions for the provided functions', () => {
      const funcs = [
        { FunctionName: 'listDeployments-dev-func1' },
        { FunctionName: 'listDeployments-dev-func2' },
      ];

      return awsDeployList.getFunctionVersions(funcs).then((result) => {
        const expectedResult = [
          {
            Versions: [
              { FunctionName: 'listDeployments-dev-func', Version: '$LATEST' },
            ],
          },
          {
            Versions: [
              { FunctionName: 'listDeployments-dev-func', Version: '$LATEST' },
            ],
          },
        ];

        expect(listVersionsByFunctionStub.calledTwice).to.equal(true);
        expect(result).to.deep.equal(expectedResult);
      });
    });
  });

  describe('#displayFunctions()', () => {
    const funcs = [
      {
        Versions: [
          { FunctionName: 'listDeployments-dev-func-1', Version: '1337' },
        ],
      },
      {
        Versions: [
          { FunctionName: 'listDeployments-dev-func-2', Version: '2' },
          { FunctionName: 'listDeployments-dev-func-2', Version: '3' },
          { FunctionName: 'listDeployments-dev-func-2', Version: '4' },
          { FunctionName: 'listDeployments-dev-func-2', Version: '5' },
          { FunctionName: 'listDeployments-dev-func-2', Version: '6' },
          { FunctionName: 'listDeployments-dev-func-2', Version: '7' },
        ],
      },
    ];

    it('should display all the functions in the service together with their versions', () => {
      const log = awsDeployList.serverless.cli.log;

      return awsDeployList.displayFunctions(funcs).then(() => {
        expect(log.calledWithExactly('Listing functions and their last 5 versions:'))
          .to.be.equal(true);
        expect(log.calledWithExactly('-------------')).to.be.equal(true);

        expect(log.calledWithExactly('func-1: 1337')).to.be.equal(true);
        expect(log.calledWithExactly('func-2: 3, 4, 5, 6, 7')).to.be.equal(true);
      });
    });
  });
});
