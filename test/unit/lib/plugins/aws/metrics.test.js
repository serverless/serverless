'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../../../lib/plugins/aws/provider');
const AwsMetrics = require('../../../../../lib/plugins/aws/metrics');
const Serverless = require('../../../../../lib/serverless');
const CLI = require('../../../../../lib/classes/cli');
const dayjs = require('dayjs');

const LocalizedFormat = require('dayjs/plugin/localizedFormat');

dayjs.extend(LocalizedFormat);

describe('AwsMetrics', () => {
  let awsMetrics;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    serverless.cli = new CLI(serverless);
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsMetrics = new AwsMetrics(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance to this.serverless', () => {
      expect(awsMetrics.serverless).to.deep.equal(serverless);
    });

    it('should set the passed in options to this.options', () => {
      expect(awsMetrics.options).to.deep.equal({ stage: 'dev', region: 'us-east-1' });
    });

    it('should set the provider variable to the AwsProvider instance', () =>
      expect(awsMetrics.provider).to.be.instanceof(AwsProvider));

    it('should have a "metrics:metrics" hook', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsMetrics.hooks['metrics:metrics']).to.not.be.undefined;
    });

    it('should run promise chain in order for "metrics:metrics" hook', async () => {
      const extendedValidateStub = sinon.stub(awsMetrics, 'extendedValidate').resolves();
      const getMetricsStub = sinon.stub(awsMetrics, 'getMetrics').resolves();
      const showMetricsStub = sinon.stub(awsMetrics, 'showMetrics').resolves();

      await awsMetrics.hooks['metrics:metrics']();

      expect(extendedValidateStub.calledOnce).to.equal(true);
      expect(getMetricsStub.calledAfter(extendedValidateStub)).to.equal(true);
      expect(showMetricsStub.calledAfter(getMetricsStub)).to.equal(true);

      awsMetrics.extendedValidate.restore();
      awsMetrics.getMetrics.restore();
      awsMetrics.showMetrics.restore();
    });
  });

  describe('#extendedValidate()', () => {
    let validateStub;

    beforeEach(() => {
      awsMetrics.serverless.service.functions = {
        function1: {},
      };
      awsMetrics.serverless.service.service = 'my-service';
      awsMetrics.options.function = 'function1';
      validateStub = sinon.stub(awsMetrics, 'validate').resolves();
    });

    afterEach(() => {
      awsMetrics.validate.restore();
    });

    it('should call the shared validate() function', () => {
      awsMetrics.extendedValidate();

      expect(validateStub.calledOnce).to.equal(true);
    });

    it('should set the startTime to yesterday as the default value if not provided', () => {
      awsMetrics.options.startTime = null;

      let yesterday = new Date();
      yesterday = yesterday.setDate(yesterday.getDate() - 1);
      yesterday = new Date(yesterday);
      const yesterdaysYear = yesterday.getFullYear();
      const yesterdaysMonth = yesterday.getMonth() + 1;
      const yesterdaysDay = yesterday.getDate();
      const yesterdaysDate = `${yesterdaysYear}-${yesterdaysMonth}-${yesterdaysDay}`;

      awsMetrics.extendedValidate();

      const defaultsStartTime = dayjs(awsMetrics.options.startTime);
      const defaultsDate = defaultsStartTime.format('YYYY-M-D');
      expect(defaultsDate).to.equal(yesterdaysDate);
    });

    it('should set the startTime to the provided value', () => {
      awsMetrics.options.startTime = '1970-01-01';

      awsMetrics.extendedValidate();

      const startTime = awsMetrics.options.startTime.toISOString();
      const expectedStartTime = new Date('1970-01-01').toISOString();
      expect(startTime).to.equal(expectedStartTime);
    });

    it('should translate human friendly syntax (e.g. 24h) for startTime', () => {
      awsMetrics.options.startTime = '24h'; // 24 hours ago

      let yesterday = new Date();
      yesterday = yesterday.setDate(yesterday.getDate() - 1);
      yesterday = new Date(yesterday);
      const yesterdaysYear = yesterday.getFullYear();
      const yesterdaysMonth = yesterday.getMonth() + 1;
      const yesterdaysDay = yesterday.getDate();
      const yesterdaysDate = `${yesterdaysYear}-${yesterdaysMonth}-${yesterdaysDay}`;

      awsMetrics.extendedValidate();

      const translatedStartTime = dayjs(awsMetrics.options.startTime);
      const translatedDate = translatedStartTime.format('YYYY-M-D');
      expect(translatedDate).to.equal(yesterdaysDate);
    });

    it('should set the endTime to today as the default value if not provided', () => {
      awsMetrics.options.endTime = null;

      const today = new Date();
      const todaysYear = today.getFullYear();
      const todaysMonth = today.getMonth() + 1;
      const todaysDay = today.getDate();
      const todaysDate = `${todaysYear}-${todaysMonth}-${todaysDay}`;

      awsMetrics.extendedValidate();

      const defaultsStartTime = dayjs(awsMetrics.options.endTime);
      const defaultsDate = defaultsStartTime.format('YYYY-M-D');

      expect(defaultsDate).to.equal(todaysDate);
    });

    it('should set the endTime to the provided value', () => {
      awsMetrics.options.endTime = '1970-01-01';

      awsMetrics.extendedValidate();

      const endTime = awsMetrics.options.endTime.toISOString();
      const expectedEndTime = new Date('1970-01-01').toISOString();
      expect(endTime).to.equal(expectedEndTime);
    });
  });

  describe('#getMetrics()', () => {
    let requestStub;

    beforeEach(() => {
      awsMetrics.serverless.service.functions = {
        function1: {
          name: 'func1',
        },
        function2: {
          name: 'func2',
        },
      };
      awsMetrics.options.startTime = new Date('1970-01-01');
      awsMetrics.options.endTime = new Date('1970-01-02');
      requestStub = sinon.stub(awsMetrics.provider, 'request');
    });

    afterEach(() => {
      awsMetrics.provider.request.restore();
    });

    it('should gather service wide function metrics if no function option is specified', async () => {
      // stubs for function1
      // invocations
      requestStub.onCall(0).resolves({
        ResponseMetadata: { RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755-func1' },
        Label: 'Invocations',
        Datapoints: [],
      });
      // throttles
      requestStub.onCall(1).resolves({
        ResponseMetadata: { RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2-func1' },
        Label: 'Throttles',
        Datapoints: [],
      });
      // errors
      requestStub.onCall(2).resolves({
        ResponseMetadata: { RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b-func1' },
        Label: 'Errors',
        Datapoints: [],
      });
      // duration
      requestStub.onCall(3).resolves({
        ResponseMetadata: { RequestId: '1f63db14-b569-11e6-8501-d98a275ce164-func1' },
        Label: 'Duration',
        Datapoints: [],
      });
      // stubs for function2
      // invocations
      requestStub.onCall(4).resolves({
        ResponseMetadata: { RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755-func2' },
        Label: 'Invocations',
        Datapoints: [],
      });
      // throttles
      requestStub.onCall(5).resolves({
        ResponseMetadata: { RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2-func2' },
        Label: 'Throttles',
        Datapoints: [],
      });
      // errors
      requestStub.onCall(6).resolves({
        ResponseMetadata: { RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b-func2' },
        Label: 'Errors',
        Datapoints: [],
      });
      // duration
      requestStub.onCall(7).resolves({
        ResponseMetadata: { RequestId: '1f63db14-b569-11e6-8501-d98a275ce164-func2' },
        Label: 'Duration',
        Datapoints: [],
      });

      const expectedResult = [
        [
          {
            ResponseMetadata: { RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755-func1' },
            Label: 'Invocations',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2-func1' },
            Label: 'Throttles',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b-func1' },
            Label: 'Errors',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f63db14-b569-11e6-8501-d98a275ce164-func1' },
            Label: 'Duration',
            Datapoints: [],
          },
        ],
        [
          {
            ResponseMetadata: { RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755-func2' },
            Label: 'Invocations',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2-func2' },
            Label: 'Throttles',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b-func2' },
            Label: 'Errors',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f63db14-b569-11e6-8501-d98a275ce164-func2' },
            Label: 'Duration',
            Datapoints: [],
          },
        ],
      ];

      const result = await awsMetrics.getMetrics();
      expect(result).to.deep.equal(expectedResult);
    });

    it('should gather function metrics if function option is specified', async () => {
      // only display metrics for function1
      awsMetrics.options.function = 'function1';

      // stubs for function1
      // invocations
      requestStub.onCall(0).resolves({
        ResponseMetadata: { RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755-func1' },
        Label: 'Invocations',
        Datapoints: [],
      });
      // throttles
      requestStub.onCall(1).resolves({
        ResponseMetadata: { RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2-func1' },
        Label: 'Throttles',
        Datapoints: [],
      });
      // errors
      requestStub.onCall(2).resolves({
        ResponseMetadata: { RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b-func1' },
        Label: 'Errors',
        Datapoints: [],
      });
      // duration
      requestStub.onCall(3).resolves({
        ResponseMetadata: { RequestId: '1f63db14-b569-11e6-8501-d98a275ce164-func1' },
        Label: 'Duration',
        Datapoints: [],
      });

      const expectedResult = [
        [
          {
            ResponseMetadata: { RequestId: '1f50045b-b569-11e6-86c6-eb54d1aaa755-func1' },
            Label: 'Invocations',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f59059b-b569-11e6-aa18-c7bab68810d2-func1' },
            Label: 'Throttles',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f50c7b1-b569-11e6-b1b6-ab86694b617b-func1' },
            Label: 'Errors',
            Datapoints: [],
          },
          {
            ResponseMetadata: { RequestId: '1f63db14-b569-11e6-8501-d98a275ce164-func1' },
            Label: 'Duration',
            Datapoints: [],
          },
        ],
      ];

      const result = await awsMetrics.getMetrics();
      expect(result).to.deep.equal(expectedResult);
    });

    it('should gather metrics with 1 hour period for time span < 24 hours', async () => {
      awsMetrics.options.startTime = new Date('1970-01-01T09:00');
      awsMetrics.options.endTime = new Date('1970-01-01T16:00');

      await awsMetrics.getMetrics();

      expect(
        requestStub.calledWith(
          sinon.match.string,
          sinon.match.string,
          sinon.match.has('Period', 3600)
        )
      ).to.equal(true);
    });

    it('should gather metrics with 1 day period for time span > 24 hours', async () => {
      awsMetrics.options.startTime = new Date('1970-01-01');
      awsMetrics.options.endTime = new Date('1970-01-03');

      await awsMetrics.getMetrics();

      expect(
        requestStub.calledWith(
          sinon.match.string,
          sinon.match.string,
          sinon.match.has('Period', 24 * 3600)
        )
      ).to.equal(true);
    });
  });
});
