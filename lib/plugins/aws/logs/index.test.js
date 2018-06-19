'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../provider/awsProvider');
const AwsLogs = require('./index');
const Serverless = require('../../../Serverless');

describe('AwsLogs', () => {
  let serverless;
  let awsLogs;

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
    };
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsLogs = new AwsLogs(serverless, options);
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
        .stub(awsLogs, 'extendedValidate').resolves();
      const getLogStreamsStub = sinon
        .stub(awsLogs, 'getLogStreams').resolves();
      const showLogsStub = sinon
        .stub(awsLogs, 'showLogs').resolves();

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
      const replyMock = {
        logStreams: [
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            creationTime: 1469687512311,
          },
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            creationTime: 1469687512311,
          },
        ],
      };
      const getLogStreamsStub = sinon.stub(awsLogs.provider, 'request').resolves(replyMock);

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
            }
          )).to.be.equal(true);

          expect(logStreamNames[0])
            .to.be.equal('2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba');
          expect(logStreamNames[1])
            .to.be.equal('2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba');

          awsLogs.provider.request.restore();
        });
    });

    it('should throw error if no log streams found', () => {
      sinon.stub(awsLogs.provider, 'request').resolves();

      return awsLogs.getLogStreams()
        .then(() => {
          expect(1).to.equal(2);
          awsLogs.provider.request.restore();
        }).catch(e => {
          expect(e.name).to.be.equal('ServerlessError');
          awsLogs.provider.request.restore();
        });
    });
  });

  describe('#showLogs()', () => {
    let clock;
    const fakeTime = new Date(Date.UTC(2016, 9, 1)).getTime();

    beforeEach(() => {
      // set the fake Date 'Sat Sep 01 2016 00:00:00'
      clock = sinon.useFakeTimers(fakeTime);
    });

    afterEach(() => {
      // new Date() => will return the real time again (now)
      clock.restore();
    });

    it('should call filterLogEvents API with correct params', () => {
      const replyMock = {
        events: [
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
        ],
      };
      const logStreamNamesMock = [
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
      ];
      const filterLogEventsStub = sinon.stub(awsLogs.provider, 'request').resolves(replyMock);
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        startTime: '3h',
        filter: 'error',
      };

      return awsLogs.showLogs(logStreamNamesMock)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWithExactly(
            'CloudWatchLogs',
            'filterLogEvents',
            {
              logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
              interleaved: true,
              logStreamNames: logStreamNamesMock,
              filterPattern: 'error',
              startTime: fakeTime - (3 * 60 * 60 * 1000), // -3h
            }
          )).to.be.equal(true);
          awsLogs.provider.request.restore();
        });
    });

    it('should call filterLogEvents API with standard start time', () => {
      const replyMock = {
        events: [
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
        ],
      };
      const logStreamNamesMock = [
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
      ];
      const filterLogEventsStub = sinon.stub(awsLogs.provider, 'request').resolves(replyMock);
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        startTime: '2010-10-20',
        filter: 'error',
      };

      return awsLogs.showLogs(logStreamNamesMock)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWithExactly(
            'CloudWatchLogs',
            'filterLogEvents',
            {
              logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
              interleaved: true,
              logStreamNames: logStreamNamesMock,
              startTime: 1287532800000, // '2010-10-20'
              filterPattern: 'error',
            }
          )).to.be.equal(true);

          awsLogs.provider.request.restore();
        });
    });

    it('should call filterLogEvents API with latest 10 minutes if startTime not given', () => {
      const replyMock = {
        events: [
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
        ],
      };
      const logStreamNamesMock = [
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
      ];
      const filterLogEventsStub = sinon.stub(awsLogs.provider, 'request').resolves(replyMock);
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
      };

      return awsLogs.showLogs(logStreamNamesMock)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWithExactly(
            'CloudWatchLogs',
            'filterLogEvents',
            {
              logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
              interleaved: true,
              logStreamNames: logStreamNamesMock,
              startTime: fakeTime - (10 * 60 * 1000), // fakeTime - 10 minutes
            }
          )).to.be.equal(true);

          awsLogs.provider.request.restore();
        });
    });

    it('should call filterLogEvents API which starts 10 seconds in the past if tail given', () => {
      const replyMock = {
        events: [
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
          {
            logStreamName: '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
            timestamp: 1469687512311,
            message: 'test',
          },
        ],
      };
      const logStreamNamesMock = [
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
        '2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba',
      ];
      const filterLogEventsStub = sinon.stub(awsLogs.provider, 'request').resolves(replyMock);
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
        tail: true,
      };

      return awsLogs.showLogs(logStreamNamesMock)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWithExactly(
            'CloudWatchLogs',
            'filterLogEvents',
            {
              logGroupName: awsLogs.provider.naming.getLogGroupName('new-service-dev-first'),
              interleaved: true,
              logStreamNames: logStreamNamesMock,
              startTime: fakeTime - (10 * 1000), // fakeTime - 10 minutes
            }
          )).to.be.equal(true);

          awsLogs.provider.request.restore();
        });
    });
  });
});
