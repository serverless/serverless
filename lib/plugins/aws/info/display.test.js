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
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    serverless.cli = new CLI(serverless);
    serverless.service.service = 'my-service';
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsInfo = new AwsInfo(serverless, options);
    awsInfo.gatheredData = {
      info: {
        service: 'my-first',
        stage: 'dev',
        region: 'eu-west-1',
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
    expectedMessage += `${chalk.yellow('region:')} eu-west-1`;
    expectedMessage += `\n${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('endpoints:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('functions:')}`;
    expectedMessage += '\n  None';

    const message = awsInfo.display();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);
  });

  it('should display API keys if given', () => {
    awsInfo.gatheredData.info.apiKeys = [{ name: 'keyOne', value: '1234' }];

    let expectedMessage = '';

    expectedMessage += `${chalk.yellow.underline('Service Information')}\n`;
    expectedMessage += `${chalk.yellow('service:')} my-first\n`;
    expectedMessage += `${chalk.yellow('stage:')} dev\n`;
    expectedMessage += `${chalk.yellow('region:')} eu-west-1`;
    expectedMessage += `\n${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  keyOne: 1234';
    expectedMessage += `\n${chalk.yellow('endpoints:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('functions:')}`;
    expectedMessage += '\n  None';

    const message = awsInfo.display();
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

    expectedMessage += `${chalk.yellow.underline('Service Information')}\n`;
    expectedMessage += `${chalk.yellow('service:')} my-first\n`;
    expectedMessage += `${chalk.yellow('stage:')} dev\n`;
    expectedMessage += `${chalk.yellow('region:')} eu-west-1`;
    expectedMessage += `\n${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('endpoints:')}`;
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev';
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/both';
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/both/add';
    expectedMessage += '\n  POST - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/e';
    expectedMessage += '\n  GET - ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev/function1';
    expectedMessage += `\n${chalk.yellow('functions:')}`;
    expectedMessage += '\n  None';

    const message = awsInfo.display();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);
  });

  it('should display functions with metrics if given', () => {
    awsInfo.gatheredData.info.functions = [
      {
        name: 'function1',
        arn: 'arn:aws:iam::12345678:function:function1',
        metrics: [
          {
            ResponseMetadata: {
              RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755',
            },
            Label: 'Invocations',
            Datapoints: [{ Sum: 12 }],
          },
          {
            ResponseMetadata: {
              RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2',
            },
            Label: 'Throttles',
            Datapoints: [{ Sum: 15 }],
          },
          {
            ResponseMetadata: {
              RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b',
            },
            Label: 'Errors',
            Datapoints: [{ Sum: 1 }],
          },
          {
            ResponseMetadata: {
              RequestId: '1f63db14-b569-11e6-8501-d98a275ce164',
            },
            Label: 'Duration',
            Datapoints: [{ Average: 1000 }],
          },
        ],
      },
      {
        name: 'function2',
        arn: 'arn:aws:iam::12345678:function:function2',
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
      {
        name: 'function3',
        arn: 'arn:aws:iam::12345678:function:function3',
        metrics: [],
      },
    ];

    let expectedMessage = '';

    expectedMessage += `${chalk.yellow.underline('Service Information')}\n`;
    expectedMessage += `${chalk.yellow('service:')} my-first\n`;
    expectedMessage += `${chalk.yellow('stage:')} dev\n`;
    expectedMessage += `${chalk.yellow('region:')} eu-west-1`;
    expectedMessage += `\n${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('endpoints:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('functions:')}`;
    expectedMessage += '\n  function1:\n';
    expectedMessage += `    ${chalk.yellow('arn:')} arn:aws:iam::12345678:function:function1\n`;
    expectedMessage += `    ${chalk.yellow('metrics (last 24h):')}\n`;
    expectedMessage += `      ${chalk.yellow('invocations:')} 12`;
    expectedMessage += '\n';
    expectedMessage += `      ${chalk.yellow('throttles:')} 15`;
    expectedMessage += '\n';
    expectedMessage += `      ${chalk.yellow('errors:')} 1`;
    expectedMessage += '\n';
    expectedMessage += `      ${chalk.yellow('avg duration:')} 1000ms`;
    expectedMessage += '\n  function2:\n';
    expectedMessage += `    ${chalk.yellow('arn:')} arn:aws:iam::12345678:function:function2\n`;
    expectedMessage += `    ${chalk.yellow('metrics (last 24h):')}\n`;
    expectedMessage += `      ${chalk.yellow('invocations:')} 0`;
    expectedMessage += '\n';
    expectedMessage += `      ${chalk.yellow('throttles:')} 0`;
    expectedMessage += '\n';
    expectedMessage += `      ${chalk.yellow('errors:')} 0`;
    expectedMessage += '\n';
    expectedMessage += `      ${chalk.yellow('avg duration:')} 0`;
    expectedMessage += '\n  function3:\n';
    expectedMessage += `    ${chalk.yellow('arn:')} arn:aws:iam::12345678:function:function3\n`;
    expectedMessage += `    ${chalk.yellow('metrics (last 24h):')}\n`;
    expectedMessage += '      None';

    const message = awsInfo.display();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);
  });

  it('should display cloudformation outputs when verbose output is requested', () => {
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

    expectedMessage += `${chalk.yellow.underline('Service Information')}\n`;
    expectedMessage += `${chalk.yellow('service:')} my-first\n`;
    expectedMessage += `${chalk.yellow('stage:')} dev\n`;
    expectedMessage += `${chalk.yellow('region:')} eu-west-1`;
    expectedMessage += `\n${chalk.yellow('api keys:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('endpoints:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `\n${chalk.yellow('functions:')}`;
    expectedMessage += '\n  None';
    expectedMessage += `${chalk.yellow.underline('\n\nStack Outputs\n')}`;
    expectedMessage += `  ${chalk.yellow('Function1FunctionArn')}: ${'arn:function1'}\n`;
    expectedMessage += `  ${chalk.yellow('Function2FunctionArn')}: ${'arn:function2'}\n`;

    const message = awsInfo.display();
    expect(consoleLogStub.calledOnce).to.equal(true);
    expect(message).to.equal(expectedMessage);
  });
});
