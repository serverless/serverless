'use strict';

const chai = require('chai');
const WebSocket = require('ws');
const sinon = require('sinon');
const sleep = require('timers-ext/promise/sleep');
const consoleUi = require('@serverless/utils/console-ui');
const proxyquire = require('proxyquire').noPreserveCache();

const { expect } = chai;
chai.use(require('chai-as-promised'));

let step;
const originalSetInterval = setInterval;
describe('test/unit/lib/cli/interactive-setup/console-dev-mode-feed.test.js', function () {
  this.timeout(1000 * 60 * 3);
  const fakeOrgId = '123';
  const fakeAWSAccountId = 'account1';
  const publishFake = sinon.fake();
  const fakeRegion = 'us-east-1';
  const fakeTime = 'fakeTime';
  const consoleDevModeTargetFunctions = ['function1'];

  const fakeGreyWriter = sinon.fake.returns('');
  const fakeJSONWriter = sinon.fake.returns('');
  const fakeErrorWriter = sinon.fake.returns('');
  let socketConnection;
  let socketServer;
  let timers = [];

  before(() => {
    step = proxyquire('../../../../../lib/cli/interactive-setup/console-dev-mode-feed', {
      '@serverless/utils/api-request': async (pathname, options) => {
        if (pathname === `/api/identity/orgs/${fakeOrgId}/token`) {
          return { token: 'fakeToken' };
        }
        if (pathname === '/api/identity/me') {
          return { userId: 'user123' };
        }
        if (pathname === '/api/events/publish') {
          publishFake(options);
          return { success: true };
        }
        throw new Error(`Unexpected pathname "${pathname}"`);
      },
      '@serverless/utils/console-ui': {
        omitAndSortDevModeActivity: consoleUi.omitAndSortDevModeActivity,
        formatConsoleDate: () => fakeTime,
        formatConsoleSpan: (span) => ({
          niceName: span.name,
        }),
        formatConsoleEvent: (event) => ({
          message: /\.error\./.test(event.eventName) ? 'ERROR • fake' : 'WARNING • fake',
          payload: /\.error\./.test(event.eventName) ? event.tags.error : event.tags.warning,
        }),
      },
      '@serverless/utils/lib/auth/urls': {
        devModeFeed: 'ws://localhost:9988',
      },
      'chalk': {
        white: fakeGreyWriter,
        grey: fakeGreyWriter,
        hex: () => fakeErrorWriter,
      },
      'json-colorizer': fakeJSONWriter,
    });
  });

  beforeEach(() => {
    timers = [];
    // eslint-disable-next-line no-global-assign
    setInterval = (cb) => {
      timers.push(cb);
    };
  });

  afterEach(() => {
    if (socketConnection) {
      socketConnection.terminate();
    }
    if (socketServer) {
      socketServer.close();
    }
    // eslint-disable-next-line no-global-assign
    setInterval = originalSetInterval;
  });

  it('Should be ineffective, when not in console dev mode context', async () => {
    const context = { isConsoleDevMode: false, options: {} };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NON_DEV_MODE_CONTEXT');
  });

  it('Should be ineffective, when no org is selected', async () => {
    const context = { isConsoleDevMode: true, options: {}, org: null };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('UNRESOLVED_ORG');
  });

  it('Should be ineffective, when functions are targeted', async () => {
    const context = { isConsoleDevMode: true, options: {}, org: { orgId: fakeOrgId } };
    expect(await step.isApplicable(context)).to.be.false;
    expect(context.inapplicabilityReasonCode).to.equal('NO_TARGET_FUNCTIONS');
  });

  it('Should be effective and connect to websocket', async () => {
    const context = {
      isConsoleDevMode: true,
      options: {
        verbose: true,
      },
      org: { orgId: fakeOrgId },
      consoleDevModeTargetFunctions,
      awsAccountId: fakeAWSAccountId,
      serverless: {
        service: {
          provider: fakeRegion,
        },
      },
    };
    expect(await step.isApplicable(context)).to.be.true;

    const waitForConnection = () =>
      new Promise((resolve) => {
        socketServer = new WebSocket.Server({ port: 9988 });
        step.run(context);
        socketServer.on('connection', (ws) => {
          ws.on('message', () => {
            ws.send(
              JSON.stringify({ message: 'filters successfully applied', resetThrottle: true })
            );
          });
          resolve(ws);
        });
      });
    socketConnection = await waitForConnection();

    /**
     * Set of messages containing 👇
     *
     * 1. request
     * 2. JSON log
     * 3. text log
     * 4. JSON parsable text log
     * 5. s3 span
     * 6. Warning event
     * 7. Error event
     * 8. response
     *
     * It also included the aws.lambda* spans that should be ignored :)
     */
    const mockMessages = [
      [
        {
          body: '{"key1":"value1","key2":"value2","key3":"value3"}',
          timestamp: '2023-03-20T21:26:10.790Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'aws-lambda-request',
          sequenceId: 1679347571057,
        },
      ],
      [
        {
          name: 'aws.lambda.initialization',
          timestamp: '2023-03-20T21:26:10.365Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'span',
          sequenceId: 1679347571276,
        },
      ],
      [
        {
          body: '{"message":"Hi dev mode 👋"}\n',
          severityNumber: '1',
          severityText: 'INFO',
          timestamp: '2023-03-20T21:26:10.802Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'log',
          sequenceId: 1679344258090,
        },
        {
          body: 'text log\n',
          severityNumber: '1',
          severityText: 'INFO',
          timestamp: '2023-03-20T21:26:10.802Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'log',
          sequenceId: 1679344258091,
        },
        {
          body: '"hello"',
          severityNumber: '1',
          severityText: 'INFO',
          timestamp: '2023-03-20T21:26:10.802Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'log',
          sequenceId: 1679344258091,
        },
      ],
      [
        {
          customTags: '{}',
          input: '{"Bucket":"fake-bucket"}',
          name: 'aws.sdk.s3.listobjectsv2',
          output: '{"message": "s3 output"}',
          timestamp: '2023-03-20T21:26:10.804Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'span',
          sequenceId: 1679347571306,
        },
        {
          customTags: '{"foo":"bar"}',
          eventName: 'telemetry.warning.generated.v1',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
            warning: {
              message: 'This is a warning',
              stacktrace:
                'at module.exports.handler (/var/task/index.js:12:7)\nat process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
              type: 'WARNING_TYPE_USER',
            },
          },
          timestamp: '2023-03-20T21:26:10.916Z',
          type: 'event',
          sequenceId: 1679347571307,
        },
        {
          customTags: '{"foo":"bar"}',
          eventName: 'telemetry.error.generated.v1',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
            error: {
              message: 'Oh no!',
              name: 'Error',
              stacktrace:
                'at module.exports.handler (/var/task/index.js:13:20)\nat process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
              type: 'ERROR_TYPE_CAUGHT_USER',
            },
          },
          timestamp: '2023-03-20T21:26:10.924Z',
          type: 'event',
          sequenceId: 1679347571308,
        },
      ],
      [
        {
          customTags: '{}',
          name: 'aws.lambda.invocation',
          timestamp: '2023-03-20T21:26:10.790Z',
          type: 'span',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          sequenceId: 1679347572067,
        },
        {
          customTags: '{}',
          isHistorical: false,
          name: 'aws.lambda',
          timestamp: '2023-03-20T21:26:10.365Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'span',
          sequenceId: 1679347572068,
        },
      ],
      [
        {
          body: '{"response":"hello there"}',
          timestamp: '2023-03-20T21:26:11.934Z',
          tags: {
            aws: {
              resourceName: 'example-dev-function1',
            },
          },
          type: 'aws-lambda-response',
          sequenceId: 1679347572127,
        },
      ],
    ];

    // Send all messages
    for (const message of mockMessages) {
      socketConnection.send(JSON.stringify(message));
    }

    // Wait for all messages to be processed
    await sleep(600);

    // Publish dev mode events
    await timers[1]();

    // Close connection to socket
    socketConnection.terminate();

    // Assert that each message had a header and our text log was written
    expect(fakeGreyWriter.callCount).to.equal(12);
    expect(fakeGreyWriter.getCall(0).args[0]).to.equal(
      `\n${fakeTime} • example-dev-function1 • Invocation Started\n`
    );
    // Plain text log message
    expect(fakeGreyWriter.getCall(3).args[0]).to.equal('text log\n');
    // Empty text log message
    expect(fakeGreyWriter.getCall(5).args[0]).to.equal('"hello"\n');
    expect(fakeGreyWriter.getCall(6).args[0]).to.equal(
      `\n${fakeTime} • example-dev-function1 • Span • aws.sdk.s3.listobjectsv2\n`
    );
    // Check end message is last
    expect(fakeGreyWriter.getCall(10).args[0]).to.equal(
      `\n${fakeTime} • example-dev-function1 • Invocation Ended\n`
    );

    // Assert that our first log message was processed as JSON and both the warning and error event were printed to the console
    expect(fakeJSONWriter.callCount).to.equal(7);
    expect(fakeJSONWriter.getCall(0).args[0]).to.equal(
      `${JSON.stringify(JSON.parse(mockMessages[0][0].body), null, 2)}`
    );
    expect(fakeJSONWriter.getCall(1).args[0]).to.equal(
      `${JSON.stringify(JSON.parse(mockMessages[2][0].body), null, 2)}`
    );
    expect(fakeJSONWriter.getCall(2).args[0]).to.equal(
      `${JSON.stringify(JSON.parse(mockMessages[3][0].input), null, 2)}`
    );
    expect(fakeJSONWriter.getCall(3).args[0]).to.equal(
      `${JSON.stringify(JSON.parse(mockMessages[3][0].output), null, 2)}`
    );
    expect(fakeJSONWriter.getCall(4).args[0]).to.equal(
      `${JSON.stringify(mockMessages[3][1].tags.warning, null, 2)}`
    );
    expect(fakeJSONWriter.getCall(5).args[0]).to.equal(
      `${JSON.stringify(mockMessages[3][2].tags.error, null, 2)}`
    );
    expect(fakeJSONWriter.getCall(5).args[1].colors.BRACE).to.equal('#FD5750');

    // Assert that the error event was printed with the error
    expect(fakeErrorWriter.callCount).to.equal(1);
    expect(fakeErrorWriter.getCall(0).args[0]).to.equal(
      `\n${fakeTime} • example-dev-function1 • ERROR • fake\n`
    );

    // Validate publish event was called
    expect(publishFake.callCount).to.equal(1);
    expect(publishFake.getCall(0).args[0].body.event.logBatches).to.equal(3);
    expect(publishFake.getCall(0).args[0].body.event.responses).to.equal(1);
    expect(publishFake.getCall(0).args[0].body.event.events).to.equal(2);
    expect(publishFake.getCall(0).args[0].body.event.source).to.equal('cli:serverless');
  });
});
