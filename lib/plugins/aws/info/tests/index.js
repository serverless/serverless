'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('../');
const Serverless = require('../../../../Serverless');
const CLI = require('../../../../classes/CLI');
const BbPromise = require('bluebird');

describe('AwsInfo', () => {
  const serverless = new Serverless();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
    function: 'first',
  };
  const awsInfo = new AwsInfo(serverless, options);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInfo.hooks).to.be.not.empty);

    it('should set the provider variable to "aws"', () => expect(awsInfo.provider)
      .to.equal('aws'));

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsInfo, 'validate').returns(BbPromise.resolve());
      const gatherStub = sinon
        .stub(awsInfo, 'gather').returns(BbPromise.resolve());
      const displayStub = sinon
        .stub(awsInfo, 'display').returns(BbPromise.resolve());

      return awsInfo.hooks['info:info']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(gatherStub.calledAfter(validateStub)).to.be.equal(true);
        expect(displayStub.calledAfter(gatherStub)).to.be.equal(true);

        awsInfo.validate.restore();
        awsInfo.gather.restore();
        awsInfo.display.restore();
      });
    });
  });

  describe('#gather()', () => {
    const describeStacksResponse = {
      Stacks: [
        {
          StackId: 'arn:aws:cloudformation:us-east-1:123456789012:' +
            'stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
          Description: 'AWS CloudFormation Sample Template S3_Bucket: ' +
            'Sample template showing how to create a publicly accessible S3 bucket.',
          Tags: [],
          Outputs: [
            {
              Description: 'Name of S3 bucket to hold website content',
              OutputKey: 'IamRoleArnLambda',
              OutputValue: 'arn:aws:iam::12345678:role/myservice-dev-r-IamRoleLambda-1ABCD1ABCDEOO',
            },
            {
              Description: 'Lambda function info',
              OutputKey: 'Function1Arn',
              OutputValue: 'arn:aws:iam::12345678:function:my-first-function',
            },
            {
              Description: 'Lambda function info',
              OutputKey: 'Function2Arn',
              OutputValue: 'arn:aws:iam::12345678:function:my-second-function',
            },
            {
              Description: 'Endpoint info',
              OutputKey: 'Endpoint1',
              OutputValue: 'GET - https://ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/hello',
            },
          ],
          StackStatusReason: null,
          CreationTime: '2013-08-23T01:02:15.422Z',
          Capabilities: [],
          StackName: 'myteststack',
          StackStatus: 'CREATE_COMPLETE',
          DisableRollback: false,
        },
      ],
    };

    sinon.stub(awsInfo.sdk, 'request')
      .returns(BbPromise.resolve(describeStacksResponse));

    it('should get service name', () => {
      serverless.service.service = 'myservice';

      return awsInfo.gather().then((info) => {
        expect(info.service).to.equal('myservice');
      });
    });

    it('should get stage name', () => {
      awsInfo.gather().then((info) => {
        expect(info.stage).to.equal('dev');
      });
    });

    it('should get region name', () => {
      awsInfo.gather().then((info) => {
        expect(info.region).to.equal('us-east-1');
      });
    });

    it('should get function name and Arn', () => {
      const expectedFunctions = [
        {
          name: 'my-first-function',
          arn: 'arn:aws:iam::12345678:function:my-first-function',
        },
        {
          name: 'my-second-function',
          arn: 'arn:aws:iam::12345678:function:my-second-function',
        },
      ];

      return awsInfo.gather().then((info) => {
        expect(info.functions).to.deep.equal(expectedFunctions);
      });
    });

    it('should get endpoints', () => {
      const expectedEndpoints = [
        {
          endpoint: 'GET - https://ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/hello',
        },
      ];

      return awsInfo.gather().then((info) => {
        expect(info.endpoints).to.deep.equal(expectedEndpoints);
      });
    });
  });

  describe('#display()', () => {
    it('should format information message correctly', () => {
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog').returns();

      const info = {
        service: 'my-first',
        stage: 'dev',
        region: 'eu-west-1',
        accountId: '12345678',
        endpoints: [
          {
            endpoint: 'GET - https://ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/hello',
          },
        ],
        functions: [
          {
            name: 'my-first-dev-hello',
            arn: 'arn:aws:lambda:eu-west-1:12345678:function:my-first-dev-hello',
          },
        ],
      };

      const expectedMessage = `
Service Information
service: my-first
stage: dev
region: eu-west-1
accountId: 12345678
endpoints:
  GET - https://ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/hello
functions:
  my-first-dev-hello: arn:aws:lambda:eu-west-1:12345678:function:my-first-dev-hello`;

      expect(awsInfo.display(info)).to.equal(expectedMessage);
    });

    it("should display only general information when stack doesn't exist", () => {
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog').returns();

      const info = {
        service: 'my-first',
        stage: 'dev',
        region: 'eu-west-1',
        accountId: '',
      };

      const expectedMessage = `
Service Information
service: my-first
stage: dev
region: eu-west-1
accountId:${' '}
endpoints:
  None
functions:
  None`;

      expect(awsInfo.display(info)).to.equal(expectedMessage);
    });

    it('should display only general information when no functions or endpoints', () => {
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog').returns();

      const info = {
        service: 'my-first',
        stage: 'dev',
        region: 'eu-west-1',
        accountId: '',
        functions: [],
        endpoints: [],
      };

      const expectedMessage = `
Service Information
service: my-first
stage: dev
region: eu-west-1
accountId:${' '}
endpoints:
  None
functions:
  None`;

      expect(awsInfo.display(info)).to.equal(expectedMessage);
    });
  });
});
