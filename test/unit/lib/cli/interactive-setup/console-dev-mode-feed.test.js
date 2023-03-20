'use strict';

const chai = require('chai');
const WebSocket = require('ws');
const sinon = require('sinon');
const sleep = require('timers-ext/promise/sleep');
const proxyquire = require('proxyquire').noPreserveCache();

const { expect } = chai;
chai.use(require('chai-as-promised'));

let step;
describe('test/unit/lib/cli/interactive-setup/console-dev-mode-feed.test.js', function () {
  this.timeout(1000 * 60 * 3);
  const fakeOrgId = '123';
  const fakeAWSAccountId = 'account1';
  const publishFake = sinon.fake();
  const fakeRegion = 'us-east-1';
  const consoleDevModeTargetFunctions = {
    functionName: ['function1'],
    accountId: [fakeAWSAccountId],
    region: [fakeRegion],
  };

  const fakeGreyWriter = sinon.fake.returns('');
  const fakeJSONWriter = sinon.fake.returns('');
  const fakeErrorWriter = sinon.fake.returns('');
  let socketConnection;
  let socketServer;

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
      '@serverless/utils/lib/auth/urls': {
        devModeFeed: 'ws://localhost:9988',
      },
      'chalk': {
        grey: fakeGreyWriter,
        hex: () => fakeErrorWriter,
      },
      'json-colorizer': fakeJSONWriter,
    });
  });

  afterEach(() => {
    if (socketConnection) {
      socketConnection.terminate();
    }
    if (socketServer) {
      socketServer.close();
    }
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
      options: {},
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
          isHistorical: false,
          origin: 'ORIGIN_REQUEST',
          requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
          spanId: 'NDBmODk5ZTQ3ZDk0MzJjNDlhYjRkMzc3NmNkNjMxZTA=',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sequenceId: '1679347571057',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
          },
          timestamp: '2023-03-20T21:26:10.790Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
          type: 'aws-lambda-request',
          sequenceId: 1679347571057,
        },
      ],
      [
        {
          customTags: '{}',
          endTime: '2023-03-20T21:26:10.782Z',
          isHistorical: false,
          name: 'aws.lambda.initialization',
          parentSpanId: 'NDBmODk5ZTQ3ZDk0MzJjNDlhYjRkMzc3NmNkNjMxZTA=',
          spanId: 'ODQxYWI4YWM0Njc5ODJlZWM5ZmZhZDk1MWRlZGMwMjg=',
          startTime: '2023-03-20T21:26:10.365Z',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sequenceId: '1679347571276',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
          },
          timestamp: '2023-03-20T21:26:10.365Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
          type: 'span',
          sequenceId: 1679347571276,
        },
      ],
      [
        {
          body: '{"message":"Hi dev mode 👋"}\n',
          isHistorical: false,
          severityNumber: '1',
          severityText: 'INFO',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              logGroup: '',
              logStream: '',
              region: 'us-east-1',
              requestId: '62eff070-039b-4580-92fa-31ed28eaba79',
              resourceName: 'example-dev-function1',
              sequenceId: '1679344257820372341',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: 'lambda-internal-api', version: 'N/A' },
          },
          timestamp: '2023-03-20T21:26:10.802Z',
          traceId: 'NzI1OGFhOGU4MzQwODkzZWQ0MjMwZmNhMWFjZDkzZjg=',
          type: 'log',
          sequenceId: 1679344258090,
        },
        {
          body: 'text log\n',
          isHistorical: false,
          severityNumber: '1',
          severityText: 'INFO',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              logGroup: '',
              logStream: '',
              region: 'us-east-1',
              requestId: '62eff070-039b-4580-92fa-31ed28eaba79',
              resourceName: 'example-dev-function1',
              sequenceId: '1679344257820372341',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: 'lambda-internal-api', version: 'N/A' },
          },
          timestamp: '2023-03-20T21:26:10.802Z',
          traceId: 'NzI1OGFhOGU4MzQwODkzZWQ0MjMwZmNhMWFjZDkzZjg=',
          type: 'log',
          sequenceId: 1679344258091,
        },
        {
          body: '"hello"',
          isHistorical: false,
          severityNumber: '1',
          severityText: 'INFO',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              logGroup: '',
              logStream: '',
              region: 'us-east-1',
              requestId: '62eff070-039b-4580-92fa-31ed28eaba79',
              resourceName: 'example-dev-function1',
              sequenceId: '1679344257820372341',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: 'lambda-internal-api', version: 'N/A' },
          },
          timestamp: '2023-03-20T21:26:10.802Z',
          traceId: 'NzI1OGFhOGU4MzQwODkzZWQ0MjMwZmNhMWFjZDkzZjg=',
          type: 'log',
          sequenceId: 1679344258091,
        },
      ],
      [
        {
          customTags: '{}',
          endTime: '2023-03-20T21:26:10.916Z',
          input: '{"Bucket":"fake-bucket"}',
          isHistorical: false,
          name: 'aws.sdk.s3.listobjectsv2',
          output:
            '{"$metadata":{"httpStatusCode":200,"requestId":"xxx","extendedRequestId":"zzz","attempts":1,"totalRetryDelay":0},"Contents":[{"Key":"test.txt","LastModified":"2023-03-08T21:26:14.000Z","ETag":"\\"2bfd1c09c3ab8dde895e60fef8c2bbd1\\"","Size":1357,"StorageClass":"STANDARD"},{"Key":"test1.txt","LastModified":"2023-03-08T21:26:13.000Z","ETag":"\\"b7acd05bf692822d38b82784c988fc8a\\"","Size":2848,"StorageClass":"STANDARD"},{"Key":"test3.txt","LastModified":"2023-03-08T21:26:14.000Z","ETag":"\\"e234e981a5849592e6f484734d94a4bd\\"","Size":10930,"StorageClass":"STANDARD"}],"IsTruncated":false,"KeyCount":3,"MaxKeys":1000,"Name":"fake-bucket","Prefix":""}',
          parentSpanId: 'ZTIzNzU5MzRiNjRhZmVjZjY1MmQwMmMzMjYzMzQ3NDc=',
          spanId: 'NTBlN2MzMDdkODRmOTliZjQ0MjhkYWY3ZmNhNzQwOGE=',
          startTime: '2023-03-20T21:26:10.804Z',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sdk: {
                operation: 'listobjectsv2',
                region: 'us-east-1',
                requestId: 'M11HYWPNW1NX5J3A',
                service: 's3',
                signatureVersion: 'v4',
              },
              sequenceId: '1679347571306',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
          },
          timestamp: '2023-03-20T21:26:10.804Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
          type: 'span',
          sequenceId: 1679347571306,
        },
        {
          customTags: '{"foo":"bar"}',
          eventName: 'telemetry.warning.generated.v1',
          id: 'NWRiYmYwODIzZTlmNmUzNGNhM2Q1MzE4YjU2N2M3MGI=',
          spanId: 'ZTIzNzU5MzRiNjRhZmVjZjY1MmQwMmMzMjYzMzQ3NDc=',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sequenceId: '1679347571307',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
            warning: {
              message: 'This is a warning',
              stacktrace:
                'at module.exports.handler (/var/task/index.js:12:7)\nat process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
              type: 'WARNING_TYPE_USER',
            },
          },
          timestamp: '2023-03-20T21:26:10.916Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
          type: 'event',
          sequenceId: 1679347571307,
        },
        {
          customTags: '{"foo":"bar"}',
          eventName: 'telemetry.error.generated.v1',
          id: 'NTk3MzAwMjExNGY4Nzc3MDU1YWQ0MWQ2ZjMwODVlZjY=',
          spanId: 'ZTIzNzU5MzRiNjRhZmVjZjY1MmQwMmMzMjYzMzQ3NDc=',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sequenceId: '1679347571308',
            },
            environment: 'dev',
            error: {
              message: 'Oh no!',
              name: 'Error',
              stacktrace:
                'at module.exports.handler (/var/task/index.js:13:20)\nat process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
              type: 'ERROR_TYPE_CAUGHT_USER',
            },
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
          },
          timestamp: '2023-03-20T21:26:10.924Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
          type: 'event',
          sequenceId: 1679347571308,
        },
      ],
      [
        {
          customTags: '{}',
          endTime: '2023-03-20T21:26:11.928Z',
          isHistorical: false,
          name: 'aws.lambda.invocation',
          parentSpanId: 'NDBmODk5ZTQ3ZDk0MzJjNDlhYjRkMzc3NmNkNjMxZTA=',
          spanId: 'ZTIzNzU5MzRiNjRhZmVjZjY1MmQwMmMzMjYzMzQ3NDc=',
          startTime: '2023-03-20T21:26:10.790Z',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sequenceId: '1679347572067',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
          },
          timestamp: '2023-03-20T21:26:10.790Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
          type: 'span',
          sequenceId: 1679347572067,
        },
        {
          customTags: '{}',
          endTime: '2023-03-20T21:26:11.928Z',
          isHistorical: false,
          name: 'aws.lambda',
          spanId: 'NDBmODk5ZTQ3ZDk0MzJjNDlhYjRkMzc3NmNkNjMxZTA=',
          startTime: '2023-03-20T21:26:10.365Z',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              lambda: {
                arch: 'x86_64',
                isColdstart: true,
                name: 'example-dev-function1',
                outcome: 'OUTCOME_SUCCESS',
                requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
                version: '$LATEST',
              },
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sequenceId: '1679347572068',
            },
            environment: 'dev',
            fingerprints: [],
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
          },
          timestamp: '2023-03-20T21:26:10.365Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
          type: 'span',
          sequenceId: 1679347572068,
        },
      ],
      [
        {
          body: '{"statusCode":200,"body":"{\\n  \\"message\\": \\"Go Serverless v3.0! Your function executed successfully!\\",\\n  \\"input\\": {\\n    \\"key1\\": \\"value1\\",\\n    \\"key2\\": \\"value2\\",\\n    \\"key3\\": \\"value3\\"\\n  }\\n}"}',
          isHistorical: false,
          origin: 'ORIGIN_RESPONSE',
          requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
          spanId: 'NDBmODk5ZTQ3ZDk0MzJjNDlhYjRkMzc3NmNkNjMxZTA=',
          tags: {
            aws: {
              accountId: fakeAWSAccountId,
              region: 'us-east-1',
              requestId: 'd9f31b0e-73ef-434a-94fa-fbedcc13cc93',
              resourceName: 'example-dev-function1',
              sequenceId: '1679347572127',
            },
            environment: 'dev',
            namespace: 'example',
            orgId: fakeOrgId,
            sdk: { name: '@serverless/aws-lambda-sdk', version: '0.14.5' },
          },
          timestamp: '2023-03-20T21:26:11.934Z',
          traceId: 'NDZhMDg3ZjY2ZjBlZTkxYmUzZmE4OThjYjJmMzg4ZDQ=',
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

    // Close connection to socket
    socketConnection.terminate();

    // Assert that each message had a header and our text log was written
    expect(fakeGreyWriter.callCount).to.equal(9);
    expect(fakeGreyWriter.getCall(0).args[0]).to.equal(
      '21:26:10.790 • example-dev-function1 • Invocation Started\n'
    );
    // Plain text log message
    expect(fakeGreyWriter.getCall(3).args[0]).to.equal('text log\n');
    // Empty text log message
    expect(fakeGreyWriter.getCall(5).args[0]).to.equal('"hello"\n');
    expect(fakeGreyWriter.getCall(6).args[0]).to.equal(
      '21:26:10.804 • example-dev-function1 • Span • 112ms • AWS SDK • S3 • LISTOBJECTSV2\n'
    );

    // Assert that our first log message was processed as JSON and both the error and warning event were printed to the console
    expect(fakeJSONWriter.callCount).to.equal(3);
    expect(fakeJSONWriter.getCall(0).args[0]).to.equal(
      `${JSON.stringify(JSON.parse(mockMessages[2][0].body), null, 2)}`
    );

    // Assert that the error event was printed with the error
    expect(fakeErrorWriter.callCount).to.equal(1);
  });
});
