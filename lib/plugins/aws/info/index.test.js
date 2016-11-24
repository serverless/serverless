'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const BbPromise = require('bluebird');
const chalk = require('chalk');

describe('AwsInfo', () => {
  const serverless = new Serverless();
  serverless.setProvider('aws', new AwsProvider(serverless));
  serverless.service.functions = {
    function1: {
      events: [
        {
          http: {
            path: 'function1',
            method: 'GET',
          },
        },
      ],
    },
    function2: {
      events: [
        {
          http: {
            path: 'function2',
            method: 'POST',
          },
        },
      ],
    },
  };
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  const awsInfo = new AwsInfo(serverless, options);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInfo.hooks).to.be.not.empty);

    it('should set the provider variable to the AwsProvider instance', () =>
      expect(awsInfo.provider).to.be.instanceof(AwsProvider));

    it('should set an empty options object if no options are given', () => {
      const awsInfoWithEmptyOptions = new AwsInfo(serverless);

      expect(awsInfoWithEmptyOptions.options).to.deep.equal({});
    });

    it('should run promise chain in order for info hook', () => {
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

    describe('when running "deploy:deploy" hook', () => {
      it('should run promise chain in order if no deploy is not set', () => {
        const validateStub = sinon
          .stub(awsInfo, 'validate').returns(BbPromise.resolve());
        const gatherStub = sinon
          .stub(awsInfo, 'gather').returns(BbPromise.resolve());
        const displayStub = sinon
          .stub(awsInfo, 'display').returns(BbPromise.resolve());

        return awsInfo.hooks['deploy:deploy']().then(() => {
          expect(validateStub.calledOnce).to.be.equal(true);
          expect(gatherStub.calledAfter(validateStub)).to.be.equal(true);
          expect(displayStub.calledAfter(gatherStub)).to.be.equal(true);

          awsInfo.validate.restore();
          awsInfo.gather.restore();
          awsInfo.display.restore();
        });
      });

      it('should resolve if no deploy', () => {
        awsInfo.options.noDeploy = true;

        const validateStub = sinon
          .stub(awsInfo, 'validate').returns(BbPromise.resolve());
        const gatherStub = sinon
          .stub(awsInfo, 'gather').returns(BbPromise.resolve());
        const displayStub = sinon
          .stub(awsInfo, 'display').returns(BbPromise.resolve());

        return awsInfo.hooks['deploy:deploy']().then(() => {
          expect(validateStub.calledOnce).to.be.equal(false);
          expect(gatherStub.calledOnce).to.be.equal(false);
          expect(displayStub.calledOnce).to.be.equal(false);

          awsInfo.validate.restore();
          awsInfo.gather.restore();
          awsInfo.display.restore();
        });
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
              Description: 'Lambda function info',
              OutputKey: 'HelloLambdaFunctionArn',
              OutputValue: 'arn:aws:iam::12345678:function:hello',
            },
            {
              Description: 'Lambda function info',
              OutputKey: 'WorldLambdaFunctionArn',
              OutputValue: 'arn:aws:iam::12345678:function:world',
            },
            {
              Description: 'URL of the service endpoint',
              OutputKey: 'ServiceEndpoint',
              OutputValue: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
            },
            {
              Description: 'first',
              OutputKey: 'ApiGatewayApiKey1Value',
              OutputValue: 'xxx',
            },
            {
              Description: 'second',
              OutputKey: 'ApiGatewayApiKey2Value',
              OutputValue: 'yyy',
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

    const describeStackStub = sinon.stub(awsInfo.provider, 'request')
      .returns(BbPromise.resolve(describeStacksResponse));

    it('should gather with correct params', () => awsInfo.gather()
      .then(() => {
        expect(describeStackStub.calledOnce).to.equal(true);
        expect(describeStackStub.calledWithExactly(
          'CloudFormation',
          'describeStacks',
          {
            StackName: awsInfo.provider.naming.getStackName(),
          },
          awsInfo.options.stage,
          awsInfo.options.region
        )).to.be.equal(true);
      })
    );

    it('should get service name', () => {
      serverless.service.service = 'myservice';

      return awsInfo.gather().then((data) => {
        expect(data.info.service).to.equal('myservice');
      });
    });

    it('should get stage name', () => {
      awsInfo.gather().then((data) => {
        expect(data.info.stage).to.equal('dev');
      });
    });

    it('should get region name', () => {
      awsInfo.gather().then((data) => {
        expect(data.info.region).to.equal('us-east-1');
      });
    });

    it('should get function name and Arn', () => {
      const expectedFunctions = [
        {
          name: 'hello',
          arn: 'arn:aws:iam::12345678:function:hello',
        },
        {
          name: 'world',
          arn: 'arn:aws:iam::12345678:function:world',
        },
      ];

      return awsInfo.gather().then((data) => {
        expect(data.info.functions).to.deep.equal(expectedFunctions);
      });
    });

    it('should get endpoint', () => {
      const expectedEndpoint = 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev';

      return awsInfo.gather().then((data) => {
        expect(data.info.endpoint).to.deep.equal(expectedEndpoint);
      });
    });

    it("should provide only general info when stack doesn't exist (ValidationError)", () => {
      awsInfo.provider.request.restore();

      serverless.service.service = 'my-first';
      const validationError = {
        code: 'ValidationError',
        message: 'Stack with id not-created-service does not exist',
      };

      sinon.stub(awsInfo.provider, 'request').returns(BbPromise.reject(validationError));

      const expectedInfo = {
        service: 'my-first',
        stage: 'dev',
        region: 'us-east-1',
      };

      return awsInfo.gather().then((data) => {
        expect(data.info).to.deep.equal(expectedInfo);
      });
    });

    it('should throw a ServerlessError when AWS sdk throws an error', () => {
      awsInfo.provider.request.restore();
      sinon.stub(awsInfo.provider, 'request').returns(BbPromise.reject(Error));

      return awsInfo.gather().catch((e) => {
        expect(e.name).to.equal('ServerlessError');
      });
    });
  });

  describe('#getApiKeyValues()', () => {
    it('should return the api keys in the info object', () => {
      // TODO: implement a pattern for stub restoring to get rid of this
      awsInfo.provider.request.restore();

      // set the API Keys for the service
      awsInfo.serverless.service.provider.apiKeys = ['foo', 'bar'];

      const gatheredData = {
        outputs: [],
        info: {
          apiKeys: [],
        },
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

      const gatheredDataAfterKeyLookup = {
        info: {
          apiKeys: [
            { name: 'foo', value: 'valueForKeyFoo' },
            { name: 'bar', value: 'valueForKeyBar' },
          ],
        },
      };

      const getApiKeysStub = sinon
        .stub(awsInfo.provider, 'request')
        .returns(BbPromise.resolve(apiKeyItems));

      return awsInfo.getApiKeyValues(gatheredData).then((result) => {
        expect(getApiKeysStub.calledOnce).to.equal(true);
        expect(result.info.apiKeys).to.deep.equal(gatheredDataAfterKeyLookup.info.apiKeys);

        awsInfo.provider.request.restore();
      });
    });

    it('should resolve with the passed-in data if no API key retrieval is necessary', () => {
      awsInfo.serverless.service.provider.apiKeys = null;

      const gatheredData = {
        outputs: [],
        info: {
          apiKeys: [],
        },
      };

      const getApiKeysStub = sinon
        .stub(awsInfo.provider, 'request')
        .returns(BbPromise.resolve());

      return awsInfo.getApiKeyValues(gatheredData).then((result) => {
        expect(getApiKeysStub.calledOnce).to.equal(false);
        expect(result).to.deep.equal(gatheredData);

        awsInfo.provider.request.restore();
      });
    });
  });

  describe('#display()', () => {
    it('should format information message correctly', () => {
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog').returns();

      const data = {
        info: {
          service: 'my-first',
          stage: 'dev',
          region: 'eu-west-1',
          endpoint: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
          functions: [
            {
              name: 'function1',
              arn: 'arn:aws:iam::12345678:function:function1',
            },
            {
              name: 'function2',
              arn: 'arn:aws:iam::12345678:function:function2',
            },
          ],
          apiKeys: [
            {
              name: 'first',
              value: 'xxx',
            },
            {
              name: 'second',
              value: 'yyy',
            },
          ],
        },
      };

      const expectedMessage = `
${chalk.yellow.underline('Service Information')}
${chalk.yellow('service:')} my-first
${chalk.yellow('stage:')} dev
${chalk.yellow('region:')} eu-west-1
${chalk.yellow('api keys:')}
  first: xxx
  second: yyy
${chalk.yellow('endpoints:')}
  GET - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/function1
  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/function2
${chalk.yellow('functions:')}
  function1: arn:aws:iam::12345678:function:function1
  function2: arn:aws:iam::12345678:function:function2
`;

      expect(awsInfo.display(data)).to.equal(expectedMessage);
    });

    it('should format information message correctly with slashed endpoint events', () => {
      serverless.cli = new CLI(serverless);
      const additionalEvents = [
        {
          http: {
            path: '/',
            method: 'POST',
          },
        },
        {
          http: {
            path: '/both/',
            method: 'POST',
          },
        },
        {
          http: {
            path: '/both/add/',
            method: 'POST',
          },
        },
        {
          http: {
            path: 'e',
            method: 'POST',
          },
        },
      ];
      serverless.service.functions = {
        function1: {
          events: additionalEvents,
        },
      };

      sinon.stub(serverless.cli, 'consoleLog').returns();

      const data = {
        info: {
          service: 'my-first',
          stage: 'dev',
          region: 'eu-west-1',
          endpoint: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
          functions: [],
        },
      };

      const expectedMessage = `
${chalk.yellow.underline('Service Information')}
${chalk.yellow('service:')} my-first
${chalk.yellow('stage:')} dev
${chalk.yellow('region:')} eu-west-1
${chalk.yellow('api keys:')}
  None
${chalk.yellow('endpoints:')}
  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev
  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/both
  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/both/add
  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/e
${chalk.yellow('functions:')}
  None
`;

      expect(awsInfo.display(data)).to.equal(expectedMessage);
    });

    it('should display only general information when stack doesn\'t exist', () => {
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog').returns();

      const data = {
        info: {
          service: 'my-first',
          stage: 'dev',
          region: 'eu-west-1',
        },
      };

      const expectedMessage = `
${chalk.yellow.underline('Service Information')}
${chalk.yellow('service:')} my-first
${chalk.yellow('stage:')} dev
${chalk.yellow('region:')} eu-west-1
${chalk.yellow('api keys:')}
  None
${chalk.yellow('endpoints:')}
  None
${chalk.yellow('functions:')}
  None
`;

      expect(awsInfo.display(data)).to.equal(expectedMessage);
    });

    it('should display only general information when no functions, endpoints or api keys', () => {
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog').returns();

      const data = {
        info: {
          service: 'my-first',
          stage: 'dev',
          region: 'eu-west-1',
          functions: [],
          endpoint: undefined,
        },
      };

      const expectedMessage = `
${chalk.yellow.underline('Service Information')}
${chalk.yellow('service:')} my-first
${chalk.yellow('stage:')} dev
${chalk.yellow('region:')} eu-west-1
${chalk.yellow('api keys:')}
  None
${chalk.yellow('endpoints:')}
  None
${chalk.yellow('functions:')}
  None
`;

      expect(awsInfo.display(data)).to.equal(expectedMessage);
    });

    it('should display cloudformation outputs when verbose output is requested', () => {
      serverless.cli = new CLI(serverless);
      sinon.stub(serverless.cli, 'consoleLog').returns();

      const verboseOptions = {
        stage: 'dev',
        region: 'us-east-1',
        verbose: true,
      };
      const awsVerboseInfo = new AwsInfo(serverless, verboseOptions);

      const verboseData = {
        info: {
          service: 'my-first',
          stage: 'dev',
          region: 'eu-west-1',
          endpoint: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
          functions: [
            {
              name: 'function1',
              arn: 'arn:aws:iam::12345678:function:function1',
            },
            {
              name: 'function2',
              arn: 'arn:aws:iam::12345678:function:function2',
            },
          ],
          apiKeys: [
            {
              name: 'first',
              value: 'xxx',
            },
            {
              name: 'second',
              value: 'yyy',
            },
          ],
        },
        outputs: [
          {
            Description: 'Lambda function info',
            OutputKey: 'Function1FunctionArn',
            OutputValue: 'arn:aws:iam::12345678:function:function1',
          },
          {
            Description: 'Lambda function info',
            OutputKey: 'Function2FunctionArn',
            OutputValue: 'arn:aws:iam::12345678:function:function2',
          },
        ],
      };

      expect(awsVerboseInfo.display(verboseData)).to.contain('Stack Outputs');
    });
  });
});
