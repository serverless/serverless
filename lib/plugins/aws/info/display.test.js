'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsInfo = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const CLI = require('../../../classes/CLI');
const chalk = require('chalk');

describe('#display()', () => {
  let serverless;
  let awsInfo;
  let consoleLogStub;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.cli = new CLI(serverless);
    serverless.service.service = 'my-service';
    awsInfo = new AwsInfo(serverless, options);
    awsInfo.gatheredData = {
      info: {
        service: 'my-first',
        stage: 'dev',
        region: 'eu-west-1',
        stack: 'my-first-dev',
        endpoint: null,
        functions: [],
        apiKeys: [],
      },
    };
    consoleLogStub = sinon.stub(serverless.cli, 'consoleLog').returns();
  });

  afterEach(() => {
    serverless.cli.consoleLog.restore();
  });

  it('should display general service info', () => {
    let expectedMessage = '';

    expectedMessage += `${chalk.yellow.underline('Service Information')}\n`;
    expectedMessage += `${chalk.yellow('service:')} my-first\n`;
    expectedMessage += `${chalk.yellow('stage:')} dev\n`;
    expectedMessage += `${chalk.yellow('region:')} eu-west-1\n`;
    expectedMessage += `${chalk.yellow('stack:')} my-first-dev`;

    const message = awsInfo.displayServiceInfo();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);
  });

  it('should display API keys if given', () => {
    awsInfo.gatheredData.info.apiKeys = [{ name: 'keyOne', value: '1234' }];

    let expectedMessage = '';

    expectedMessage += `${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  keyOne: 1234';

    const message = awsInfo.displayApiKeys();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);

    delete awsInfo.gatheredData.info.apiKeys;
    const missingMessage = awsInfo.displayApiKeys();
    expectedMessage = `${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  None';
    expect(missingMessage).to.equal(expectedMessage);
  });

  it('should hide API keys values when `--conceal` is given', () => {
    awsInfo.options.conceal = true;
    awsInfo.gatheredData.info.apiKeys = [{ name: 'keyOne', value: '1234' }];

    let expectedMessage = '';

    expectedMessage += `${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  keyOne';

    const message = awsInfo.displayApiKeys();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);
  });

  it('should display endpoints if given', () => {
    awsInfo.serverless.service.functions = {
      function1: {
        events: [
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
        ],
      },
      function2: {
        events: [
          {
            http: 'GET function1',
          },
        ],
      },
      function3: {
        events: [
          {
            s3: 'used-to-trigger-if',
          },
        ],
      },
    };

    awsInfo.gatheredData.info.endpoint = 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev';

    let expectedMessage = '';

    expectedMessage += `${chalk.yellow('endpoints:')}`;
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev';
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/both';
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/both/add';
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/e';
    expectedMessage += '\n  GET - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/function1';

    const message = awsInfo.displayEndpoints();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);

    delete awsInfo.gatheredData.info.endpoint;
    const missingMessage = awsInfo.displayEndpoints();
    expectedMessage = `${chalk.yellow('endpoints:')}`;
    expectedMessage += '\n  None';
    expect(missingMessage).to.equal(expectedMessage);
  });

  it('should display functions if given', () => {
    awsInfo.gatheredData.info.functions = [
      {
        name: 'function1',
        deployedName: 'my-first-dev-function1',
      },
      {
        name: 'function2',
        deployedName: 'my-first-dev-function2',
      },
      {
        name: 'function3',
        deployedName: 'my-first-dev-function3',
      },
    ];

    let expectedMessage = '';

    expectedMessage += `${chalk.yellow('functions:')}`;
    expectedMessage += '\n  function1: my-first-dev-function1';
    expectedMessage += '\n  function2: my-first-dev-function2';
    expectedMessage += '\n  function3: my-first-dev-function3';

    const message = awsInfo.displayFunctions();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);

    delete awsInfo.gatheredData.info.functions;
    const missingMessage = awsInfo.displayFunctions();
    expectedMessage = `${chalk.yellow('functions:')}`;
    expectedMessage += '\n  None';
    expect(missingMessage).to.equal(expectedMessage);
  });

  it('should display CloudFormation outputs when verbose output is requested', () => {
    awsInfo.options.verbose = true;

    awsInfo.gatheredData.outputs = [
      {
        Description: 'Lambda function info',
        OutputKey: 'Function1FunctionArn',
        OutputValue: 'arn:function1',
      },
      {
        Description: 'Lambda function info',
        OutputKey: 'Function2FunctionArn',
        OutputValue: 'arn:function2',
      },
    ];

    let expectedMessage = '';

    expectedMessage += `${chalk.yellow.underline('\nStack Outputs\n')}`;
    expectedMessage += `${chalk.yellow('Function1FunctionArn')}: ${'arn:function1'}\n`;
    expectedMessage += `${chalk.yellow('Function2FunctionArn')}: ${'arn:function2'}\n`;

    const message = awsInfo.displayStackOutputs();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);

    awsInfo.options.verbose = false;
    const nonVerboseMessage = awsInfo.displayStackOutputs();
    expect(nonVerboseMessage).to.equal('');
  });
});
