'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsLogs = require('../');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');

describe('AwsLogs', () => {
  const serverless = new Serverless();
  const options = {
    stage: 'dev',
    region: 'us-east-1',
    function: 'first',
  };
  const awsLogs = new AwsLogs(serverless, options);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsLogs.hooks).to.be.not.empty);

    it('should set the provider variable to "aws"', () => expect(awsLogs.provider)
      .to.equal('aws'));

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
      expect(awsLogs.options.logGroupName).to.deep.equal('/aws/lambda/customName');
    }));
  });

  describe('#getLogStreams()', () => {
    beforeEach(() => {
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: '/aws/lambda/new-service-dev-first',
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
      const getLogStreamsStub = sinon.stub(awsLogs.sdk, 'request').
      returns(BbPromise.resolve(replyMock));

      return awsLogs.getLogStreams()
        .then(logStreamNames => {
          expect(getLogStreamsStub.calledOnce).to.be.equal(true);
          expect(getLogStreamsStub.calledWith('CloudWatchLogs',
            'describeLogStreams',
            awsLogs.options.stage,
            awsLogs.options.region));
          expect(getLogStreamsStub.args[0][2].logGroupName)
            .to.be.equal('/aws/lambda/new-service-dev-first');
          expect(getLogStreamsStub.args[0][2].descending)
            .to.be.equal(true);
          expect(getLogStreamsStub.args[0][2].limit).to.be.equal(50);
          expect(getLogStreamsStub.args[0][2].orderBy).to.be.equal('LastEventTime');

          expect(logStreamNames[0])
            .to.be.equal('2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba');
          expect(logStreamNames[1])
            .to.be.equal('2016/07/28/[$LATEST]83f5206ab2a8488290349b9c1fbfe2ba');

          awsLogs.sdk.request.restore();
        });
    });

    it('should throw error if no log streams found', () => {
      sinon.stub(awsLogs.sdk, 'request').returns(BbPromise.resolve());

      return awsLogs.getLogStreams()
        .then(() => {
          expect(1).to.equal(2);
          awsLogs.sdk.request.restore();
        }).catch(e => {
          expect(e.name).to.be.equal('ServerlessError');
          awsLogs.sdk.request.restore();
        });
    });
  });

  describe('#showLogs()', () => {
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
      const filterLogEventsStub = sinon.stub(awsLogs.sdk, 'request').
      returns(BbPromise.resolve(replyMock));
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: '/aws/lambda/new-service-dev-first',
        startTime: '3h',
        filter: 'error',
      };

      return awsLogs.showLogs(logStreamNamesMock)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWith('CloudWatchLogs',
            'filterLogEvents',
            awsLogs.options.stage,
            awsLogs.options.region));
          expect(filterLogEventsStub.args[0][2].logGroupName)
            .to.be.equal('/aws/lambda/new-service-dev-first');
          expect(filterLogEventsStub.args[0][2].interleaved).to.be.equal(true);
          expect(filterLogEventsStub.args[0][2].logStreamNames).to.deep.equal(logStreamNamesMock);
          expect(filterLogEventsStub.args[0][2].filterPattern).to.be.equal('error');
          expect(typeof filterLogEventsStub.args[0][2].startTime).to.be.equal('number');
          awsLogs.sdk.request.restore();
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
      const filterLogEventsStub = sinon.stub(awsLogs.sdk, 'request').
      returns(BbPromise.resolve(replyMock));
      awsLogs.serverless.service.service = 'new-service';
      awsLogs.options = {
        stage: 'dev',
        region: 'us-east-1',
        function: 'first',
        logGroupName: '/aws/lambda/new-service-dev-first',
        startTime: '2010-10-20',
        filter: 'error',
      };

      return awsLogs.showLogs(logStreamNamesMock)
        .then(() => {
          expect(filterLogEventsStub.calledOnce).to.be.equal(true);
          expect(filterLogEventsStub.calledWith('CloudWatchLogs',
            'filterLogEvents',
            awsLogs.options.stage,
            awsLogs.options.region));
          expect(filterLogEventsStub.args[0][2].logGroupName)
            .to.be.equal('/aws/lambda/new-service-dev-first');
          expect(filterLogEventsStub.args[0][2].interleaved).to.be.equal(true);
          expect(filterLogEventsStub.args[0][2].logStreamNames).to.deep.equal(logStreamNamesMock);
          expect(filterLogEventsStub.args[0][2].filterPattern).to.be.equal('error');
          expect(typeof filterLogEventsStub.args[0][2].startTime).to.be.equal('number');
          awsLogs.sdk.request.restore();
        });
    });
  });
});
