'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../provider/awsProvider');
const AwsLogs = require('./index');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');
const _ = require('lodash');

describe('AwsLogs', () => {
  let serverless;
  let awsLogs;

  // Reusable prepared results for stubs
  const preparedLogStreams = BbPromise.resolve({
    logStreams: [
      {
        logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        creationTime: 1469687512311,
      },
      {
        logStreamName: '2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        creationTime: 1469687512311,
      },
    ],
  });

  const preparedLogStreamNames = [
    '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ];

  const preparedLogEvents = BbPromise.resolve({
    events: [
      {
        logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        timestamp: 1469687512311,
        message: 'test-message-aaaa',
      },
      {
        logStreamName: '2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        timestamp: 1469687512311,
        message: 'test-message-bbbb',
      },
    ],
  });

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsLogs = new AwsLogs(serverless, options);

    this.providerRequestStub = sinon.stub(awsLogs.provider, 'request');
  });

  afterEach(() => {
    awsLogs.provider.request.restore();
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsLogs.hooks).to.be.not.empty);

    it('should set an empty options object if no options are given', () => {
      const awsLogsWithEmptyOptions = new AwsLogs(serverless);

      expect(awsLogsWithEmptyOptions.options).to.deep.equal({});
    });

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsLogs.provider).to.be.instanceof(AwsProvider));

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsLogs, 'extendedValidate').returns(BbPromise.resolve());
      const getLogStreamsStub = sinon
        .stub(awsLogs, 'getLogStreams').returns(BbPromise.resolve());
      const showLogsStub = sinon
        .stub(awsLogs, 'showLogs').returns(BbPromise.resolve());

      return awsLogs.hooks['logs:logs']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(getLogStreamsStub.calledAfter(validateStub)).to.be.equal(true);
        expect(showLogsStub.calledAfter(getLogStreamsStub)).to.be.equal(true);

        awsLogs.extendedValidate.restore();
        awsLogs.getLogStreams.restore();
        awsLogs.showLogs.restore();
      });
    });
  });

  describe('#extendedValidate()', () => {
    beforeEach(() => {
      serverless.config.servicePath = true;
      serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              'us-east-1': {
                vars: {},
              },
            },
          },
        },
      };
      serverless.service.functions = {
        first: {
          handler: true,
          name: 'customName',
        },
      };
    });

    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsLogs.extendedValidate()).to.throw(Error);
    });

    it('it should set default options', () => awsLogs.extendedValidate().then(() => {
      expect(awsLogs.options.stage).to.deep.equal('dev');
      expect(awsLogs.options.region).to.deep.equal('us-east-1');
      expect(awsLogs.options.function).to.deep.equal('first');
      expect(awsLogs.options.interval).to.be.equal(1000);
      expect(awsLogs.options.logGroupName).to.deep.equal(awsLogs.provider.naming
        .getLogGroupName('customName'));
    }));
  });

  describe('#getLogStreams()', () => {
    beforeEach(() => {
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
      };
    });

    it('should get log streams with correct params', () => {
      const getLogStreamsStub = this.providerRequestStub.returns(preparedLogStreams);

      return awsLogs.getLogStreams()
        .then(logStreamNames => {
          expect(getLogStreamsStub.calledOnce).to.be.equal(true);
          expect(getLogStreamsStub.calledWithExactly(
            'CloudWatchLogs',
            'describeLogStreams',
            {
              logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
              descending: true,
              limit: 50,
              orderBy: 'LastEventTime',
            },
            awsLogs.options.stage,
            awsLogs.options.region
          )).to.be.equal(true);

          expect(logStreamNames[0])
            .to.be.equal('2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
          expect(logStreamNames[1])
            .to.be.equal('2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
        });
    });

    it('should filter unrelated logs', () => {
      const replyMock = {
        logStreams: [
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            creationTime: 1469687512311,
          },
          {
            logStreamName: 'a-different-log-stream',
            creationTime: 1469687512311,
          },
          {
            logStreamName: '2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            creationTime: 1469687512311,
          },
          {
            logStreamName: '2016/07/28/[$NOTLATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            creationTime: 1469687512311,
          },
        ],
      };
      this.providerRequestStub.returns(
        BbPromise.resolve(replyMock)
      );

      return awsLogs.getLogStreams()
        .then(logStreamNames => {
          expect(logStreamNames.length).to.be.equal(2);
          expect(logStreamNames[0])
            .to.be.equal('2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
          expect(logStreamNames[1])
            .to.be.equal('2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
        });
    });

    it('should throw error if no log streams found', () => {
      this.providerRequestStub.returns(BbPromise.resolve());

      return awsLogs.getLogStreams()
        .then(() => {
          expect.fail(0, 1, 'No ServerlessError');
        }).catch(e => {
          expect(e.name).to.be.equal('ServerlessError');
        });
    });
  });

  describe('#showLogs()', () => {
    let clock;

    beforeEach(() => {
      // new Date() => return the fake Date 'Sat Sep 01 2016 00:00:00'
      clock = sinon.useFakeTimers(new Date(Date.UTC(2016, 9, 1)).getTime());

      // Stub console to not output messages from tested routines
      this.originalWrite = process.stdout.write.bind(process.stdout);
      sinon.stub(process.stdout, 'write', message => {
        // Silence only testing messages (marked either by presence of "test-message" string or
        // "Process exited before completing request", which we need to keep due to specific
        // processing logic of the system under test.
        // Thus we don't block framework logs or information about failed tests.
        const stMessage = message || '';
        if (!stMessage.includes('test-message')
          && !stMessage.includes('Process exited before completing request')
        ) {
          this.originalWrite(stMessage);
        }
      });
    });

    afterEach(() => {
      // new Date() => will return the real time again (now)
      clock.restore();

      process.stdout.write.restore();
    });

    // Stub provider.request to mock API calls to 'describeLogStreams' and 'filterLogEvents',
    // recording the arguments passed and returning the predefined results according
    // to the call number.
    // Return the structure to track call arguments.
    const stubRequestToTrackVariousCalls = (describeLogStreamsReturns, filterLogEventsReturns) => {
      // This is where the arguments will be stored
      const result = {
        describeLogStreamsCalls: [],
        filterLogEventsCalls: [],
      };

      // Restore default request(), which was stubbed in general beforeEach() hook
      awsLogs.provider.request.restore();

      // Stub the provider with the new custom callback.
      // Sinon supports callbacks only in the initial stub() call.
      this.providerRequestStub = sinon.stub(awsLogs.provider, 'request',
        (service, method, params) => {
          let callTracking = null;
          let callReturns = null;
          if (service === 'CloudWatchLogs') {
            switch (method) {
              case 'describeLogStreams':
                callTracking = result.describeLogStreamsCalls;
                callReturns = describeLogStreamsReturns;
                break;
              case 'filterLogEvents':
                callTracking = result.filterLogEventsCalls;
                callReturns = filterLogEventsReturns;
                break;
              default:
                throw new Error('Unknown serive and method called: ${service} - ${method}');
            }
          }
          callTracking.push({ service, method, params });
          if (callTracking.length > callReturns.length) {
            throw new Error('Unexpected call #${callTracking.length} to ${service} - ${method}');
          }
          return callReturns[callTracking.length - 1];
        }
      );

      return result;
    };

    it('should call filterLogEvents API with correct params', () => {
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        startTime: '3h',
        filter: 'error',
      };

      const filterLogEventsStub = this.providerRequestStub.returns(preparedLogEvents);

      return awsLogs.showLogs(preparedLogStreamNames)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWithExactly(
            'CloudWatchLogs',
            'filterLogEvents',
            {
              logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
              interleaved: true,
              logStreamNames: preparedLogStreamNames,
              filterPattern: 'error',
              startTime: 1475269200000,
            },
            awsLogs.options.stage,
            awsLogs.options.region
          )).to.be.equal(true);

          expect(process.stdout.write.getCall(0).args[0]).to.be.equal('test-message-aaaa');
          expect(process.stdout.write.getCall(1).args[0]).to.be.equal('test-message-bbbb');
        });
    });

    it('should call filterLogEvents API with standard start time', () => {
      const filterLogEventsStub = this.providerRequestStub.returns(preparedLogEvents);

      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        startTime: '2010-10-20',
        filter: 'error',
      };

      return awsLogs.showLogs(preparedLogStreamNames)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWithExactly(
            'CloudWatchLogs',
            'filterLogEvents',
            {
              logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
              interleaved: true,
              logStreamNames: preparedLogStreamNames,
              startTime: 1287532800000, // '2010-10-20'
              filterPattern: 'error',
            },
            awsLogs.options.stage,
            awsLogs.options.region
          )).to.be.equal(true);
        });
    });

    it('should tail log events', (done) => {
      const logEvents1 = {
        events: [
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            timestamp: 1469687512311,
            message: 'test-message-1-1',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            timestamp: 1469687512311,
            message: 'test-message-1-2',
          },
        ],
        nextToken: 'nextToken1',
      };
      const logEvents2 = {
        events: [],
        nextToken: 'nextToken2',
      };
      const logEvents3 = {
        events: [
          {
            logStreamName: '2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            timestamp: 1469687512311,
            message: 'test-message-3-1',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            timestamp: 1469687512311,
            message: 'test-message-3-2',
          },
        ],
        nextToken: 'nextToken3',
      };

      const tracking = stubRequestToTrackVariousCalls(
        [
          preparedLogStreams,
          preparedLogStreams,
        ],
        [
          BbPromise.resolve(logEvents1),
          BbPromise.resolve(logEvents2),
          BbPromise.resolve(logEvents3),
        ]
      );

      // Settings
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev22',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        startTime: '3h',
        filter: 'error',
        tail: true,
        interval: 500,
      };

      // Run the test asynchronously, so that we are able to see then() resolution.
      // According to Promises/A+ spec then() is not fulfilled synchronously, thus
      // we cannot test deep nesting of then() just in a synchronous manner.
      BbPromise.resolve()
        .then(() => {
          awsLogs.showLogs(preparedLogStreamNames);
        })
        .then(() => {
          // A single request to get log events
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(0);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(1);

          // And there should be calls to output the events
          expect(process.stdout.write.callCount).to.be.equal(2);
          expect(process.stdout.write.getCall(0).args[0]).to.be.equal('test-message-1-1');
          expect(process.stdout.write.getCall(1).args[0]).to.be.equal('test-message-1-2');
        })
        .then(() => {
          // Tick to almost next tail call
          clock.tick(499);
        })
        .then(() => {
          // There should be no new calls yet
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(0);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(1);
        })
        .then(() => {
          // Tick to the next tail call
          clock.tick(1);
        })
        .then(() => {
          // There should be a new call to refresh the list of log streams
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(1);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(1);
        })
        .then(() => {
          // There should be a new call to get the events
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(1);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(2);
        })
        .then(() => {
          // And there are no new output calls, because there were no events
          expect(process.stdout.write.callCount).to.be.equal(2);
        })
        .then(() => {
          // Tick to almost next tail call
          clock.tick(499);
        })
        .then(() => {
          // There should be no new calls yet
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(1);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(2);
        })
        .then(() => {
          // Tick to the next tail call
          clock.tick(1);
        })
        .then(() => {
          // There should be a new call to refresh the list of log streams
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(2);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(2);
        })
        .then(() => {
          // There should be a new call to get the events
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(2);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(3);
        })
        .then(() => {
          // And there should be calls to output the events
          expect(process.stdout.write.callCount).to.be.equal(4);
          expect(process.stdout.write.getCall(2).args[0]).to.be.equal('test-message-3-1');
          expect(process.stdout.write.getCall(3).args[0]).to.be.equal('test-message-3-2');
        })
        .finally(done);
    });

    it('should wait for the latest log streams when tailing', (done) => {
      const logStreamsNoNewReplyMock = {
        logStreams: [
          {
            logStreamName: '2016/07/28/[$NOT_LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            creationTime: 1469687512311,
          },
        ],
      };
      const logStreamsGoodReplyMock = {
        logStreams: [
          {
            logStreamName: '2016/07/28/[$NOT_LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            creationTime: 1469687512311,
          },
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            creationTime: 1469687512311,
          },
          {
            logStreamName: '2016/07/28/[$LATEST]bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            creationTime: 1469687512311,
          },
        ],
      };

      const tracking = stubRequestToTrackVariousCalls(
        [
          BbPromise.resolve(logStreamsNoNewReplyMock),
          BbPromise.resolve(logStreamsNoNewReplyMock),
          BbPromise.resolve(logStreamsGoodReplyMock),
        ],
        [preparedLogEvents]
      );

      // Settings
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev22',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        startTime: '3h',
        filter: 'error',
        tail: true,
        interval: 1000,
      };

      // Run the test asynchronously, so that we are able to see then() resolution.
      // According to Promises/A+ spec then() is not fulfilled synchronously, thus
      // we cannot test deep nesting of then() just in a synchronous manner.
      BbPromise.resolve()
        .then(() => {
          awsLogs.showLogs([]);
        })
        .then(() => {
          // No requests at first, because the class should wait before doing the next request.
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(0);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(0);
        })
        .then(() => {
          // Now tick the timer a little
          clock.tick(999);
        })
        .then(() => {
          // It is too early for the first request
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(0);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(0);
        })
        .then(() => {
          // Now tick to the first request
          clock.tick(1);
        })
        .then(() => {
          // It returns just some old log streams, so we are not expected to proceed to showing logs
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(1);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(0);
        })
        .then(() => {
          // Tick the timer a little again
          clock.tick(999);
        })
        .then(() => {
          // It should be too early for the second request
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(1);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(0);
        })
        .then(() => {
          // Now tick to the second request
          clock.tick(1);
        })
        .then(() => {
          // Expected to see the second request, which again returns just old log streams
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(2);
          expect(tracking.filterLogEventsCalls.length).to.be.equal(0);
        })
        .then(() => {
          // Now tick to the third request
          clock.tick(1000);
        })
        .then(() => {
          // Expected to see the third request, which this time returns latest log streams
          expect(tracking.describeLogStreamsCalls.length).to.be.equal(3);
        })
        .then(() => {
          // And after the promise resolution we also should see a call to get events
          // from the received log streams
          expect(tracking.filterLogEventsCalls.length).to.be.equal(1);
        })
        .finally(done);
    });

    it('should color the messages', (done) => {
      const logEvents = {
        // The messages here are copied from production - with tabs preserved
        events: [
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            timestamp: 1469687512311,
            message: 'START RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2' +
            ' Version: $LATEST | test-message-1',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            timestamp: 1469687512311,
            message: '2016-07-28T13:41:55.772Z\t'
              + '8570d766-eecd-11e6-b2c6-d12ebd340be2\t'
              + 'A custom log message | test-message-2',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            timestamp: 1469687512311,
            message: 'END RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2 | test-message-3',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            timestamp: 1469687512311,
            message: 'REPORT RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2\t'
              + 'Duration: 256.33 ms\t'
              + 'Billed Duration: 300 ms \t'
              + 'Memory Size: 128 MB\t'
              + 'Max Memory Used: 17 MB\t'
              + '| test-message-4\t',   // Yes, they can end with tab
          },
          {
            logStreamName: '2016/07/28/[$LATEST]aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            timestamp: 1469687512311,
            message: 'RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2' +
              ' Process exited before completing request',
          },
        ],
      };

      stubRequestToTrackVariousCalls(
        [preparedLogStreams],
        [BbPromise.resolve(logEvents)]
      );

      // Settings
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev22',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        startTime: '3h',
        filter: 'error',
      };

      // Run the test asynchronously, so that we are able to see then() resolution.
      // According to Promises/A+ spec then() is not fulfilled synchronously, thus
      // we cannot test deep nesting of then() just in a synchronous manner.
      BbPromise.resolve()
        .then(() => {
          awsLogs.showLogs([]);
        })
        .then(() => {
          expect(process.stdout.write.callCount).to.be.equal(5);

          // Messages
          const messages = _.times(5, index => process.stdout.write.getCall(index).args[0]);
          expect(messages[0]).to.contain('test-message-1');
          expect(messages[1]).to.contain('test-message-2');
          expect(messages[2]).to.contain('test-message-3');
          expect(messages[3]).to.contain('test-message-4');
          expect(messages[4]).to.contain('Process exited before completing request');

          // Colors
          const grey = '\u001b[90m';
          const green = '\u001b[32m';
          const red = '\u001b[31m';
          expect(messages[0]).to.contain(grey);
          expect(messages[1]).to.contain(green);
          expect(messages[2]).to.contain(grey);
          expect(messages[3]).to.contain(grey);
          expect(messages[4]).to.contain(red);
        })
        .finally(done);
    });
  });
});
