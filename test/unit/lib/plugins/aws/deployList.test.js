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

  const createS3RequestsStub = (fixtures) => {
    const stub = sinon.stub(awsDeployList.provider, 'request');

    const serviceObjects = {
      Contents: fixtures
        .flatMap(({ timestamp, artifacts }) => [
          `${s3Key}/${timestamp}/compiled-cloudformation-template.json`,
          ...Object.values(artifacts),
        ])
        .sort() // listObjectsV2() provides entries in the ascending order
        .filter((value, index, all) => all.indexOf(value) === index)
        .map((item) => ({ Key: item })),
    };
    stub.withArgs('S3', 'listObjectsV2').resolves(serviceObjects);

    fixtures.forEach(({ timestamp, artifacts }) => {
      stub
        .withArgs('S3', 'getObject', {
          Bucket: awsDeployList.bucketName,
          Key: `${s3Key}/${timestamp}/compiled-cloudformation-template.json`,
        })
        .resolves({
          Body: JSON.stringify({
            Resources: Object.entries(artifacts)
              .map(([name, key]) => [name, { Properties: { Code: { S3Key: key } } }])
              .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
              }, {}),
          }),
        });
    });

    return stub;
  };

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'listDeployments';
    const prefix = provider.getDeploymentPrefix();
    s3Key = `${prefix}/${serverless.service.service}/${provider.getStage()}`;
    awsDeployList = new AwsDeployList(serverless, options);
    awsDeployList.bucketName = 'deployment-bucket';
    awsDeployList.serverless.cli = {
      log: sinon.spy(),
    };
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
      const infoText = "Couldn't find any existing deployments.";
      expect(awsDeployList.serverless.cli.log.calledWithExactly(infoText)).to.be.equal(true);
      const verifyText = 'Please verify that stage and region are correct.';
      expect(awsDeployList.serverless.cli.log.calledWithExactly(verifyText)).to.be.equal(true);
      awsDeployList.provider.request.restore();
    });

    it('should display all available deployments', async () => {
      const fixtures = [
        {
          timestamp: '113304333331-2016-08-18T13:40:06',
          artifacts: {
            FoobarFunction: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip`,
            RabarbarFunction: `${s3Key}/113304333331-2016-08-18T13:40:06/artifact.zip`,
          },
        },
        {
          timestamp: '903940390431-2016-08-18T23:42:08',
          artifacts: {
            FoobarFunction: `${s3Key}/foobar/cafebabecafebabecafebabe00000.zip`,
            RabarbarFunction: `${s3Key}/barbaz/deadeadeadeadeadeadeadea00000.zip`,
          },
        },
      ];

      const awsRequestsStub = createS3RequestsStub(fixtures);

      await awsDeployList.listDeployments();
      expect(awsRequestsStub.called).to.be.equal(true);
      expect(
        awsRequestsStub.calledWithExactly('S3', 'listObjectsV2', {
          Bucket: awsDeployList.bucketName,
          Prefix: `${s3Key}`,
        })
      ).to.be.equal(true);

      const crucialLinesOne = [
        'Timestamp: 113304333331',
        'Datetime: 2016-08-18T13:40:06',
        '- serverless/listDeployments/dev/113304333331-2016-08-18T13:40:06/artifact.zip',
      ];
      const crucialLinesTwo = [
        'Timestamp: 903940390431',
        'Datetime: 2016-08-18T23:42:08',
        '- serverless/listDeployments/dev/foobar/cafebabecafebabecafebabe00000.zip',
        '- serverless/listDeployments/dev/barbaz/deadeadeadeadeadeadeadea00000.zip',
      ];

      ['Listing deployments:', ...crucialLinesOne, ...crucialLinesTwo].forEach((line) =>
        expect(awsDeployList.serverless.cli.log.calledWithExactly(line)).to.be.equal(true)
      );
      awsRequestsStub.restore();
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

  describe('#displayFunctions()', () => {
    const funcs = [
      {
        Versions: [{ FunctionName: 'listDeployments-dev-func-1', Version: '1337' }],
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

      awsDeployList.displayFunctions(funcs);
      expect(log.calledWithExactly('Listing functions and their last 5 versions:')).to.be.equal(
        true
      );
      expect(log.calledWithExactly('-------------')).to.be.equal(true);

      expect(log.calledWithExactly('func-1: 1337')).to.be.equal(true);
      expect(log.calledWithExactly('func-2: 3, 4, 5, 6, 7')).to.be.equal(true);
    });
  });
});
