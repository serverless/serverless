'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const OpenWhiskRemove = require('../index');
const ClientFactory = require('../../util/client_factory');
const Serverless = require('../../../../Serverless');
const chaiAsPromised = require('chai-as-promised');

require('chai').use(chaiAsPromised);

describe('OpenWhiskRemove', () => {
  const serverless = new Serverless();

  let openwhiskRemove;
  let sandbox;

  const mockFeedObject = {
    feedName: 'someFeed',
  };

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskRemove = new OpenWhiskRemove(serverless, options);
    openwhiskRemove.serverless.cli = new serverless.classes.CLI();
    openwhiskRemove.serverless.service.service = 'helloworld';
    process.env.OW_NAMESPACE = 'default';

    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.OW_NAMESPACE;
  });

  describe('#removeFeeds()', () => {
    it('should call removeFeed for each trigger feed', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeTriggerFeed', () => Promise.resolve());
      const triggers = {
        first: { feed: mockFeedObject },
        second: { feed: mockFeedObject },
        third: {},
      };

      openwhiskRemove.serverless.service.resources = { triggers };

      return openwhiskRemove.removeFeeds().then(() => {
        expect(stub.calledTwice).to.be.equal(true);
        expect(stub.calledWith('first', triggers.first)).to.be.equal(true);
        expect(stub.calledWith('second', triggers.second)).to.be.equal(true);
      });
    });
  });

  describe('#removeTriggerFeed()', () => {
    it('should call removeFeed with correct feed parameters', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeFeed', () => Promise.resolve());

      const trigger = { feed: '/whisk.system/alarms/alarm', feed_parameters: { a: 1 } };
      const feed
        = { feedName: 'alarms/alarm', namespace: 'whisk.system', trigger: '/default/myTrigger' };

      return openwhiskRemove.removeTriggerFeed('myTrigger', trigger).then(() => {
        expect(stub.calledOnce).to.be.equal(true);
        expect(stub.calledWith(feed)).to.be.equal(true);
      });
    });

    it('should call removeFeed with custom trigger namespace', () => {
      const stub = sandbox.stub(openwhiskRemove, 'removeFeed', () => Promise.resolve());

      const trigger
        = { namespace: 'custom', feed: '/whisk.system/alarms/alarm', feed_parameters: { a: 1 } };
      const feed
        = { feedName: 'alarms/alarm', namespace: 'whisk.system', trigger: '/custom/myTrigger' };

      return openwhiskRemove.removeTriggerFeed('myTrigger', trigger).then(() => {
        expect(stub.calledOnce).to.be.equal(true);
        expect(stub.calledWith(feed)).to.be.equal(true);
      });
    });
  });

  describe('#removeFeed()', () => {
    it('should remove feed from openwhisk', () => {
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const stub = params => {
          expect(params).to.be.deep.equal({
            feedName: 'some_feed',
            namespace: 'test',
            trigger: 'myTrigger',
          });
          return Promise.resolve();
        };

        return Promise.resolve({ feeds: { delete: stub } });
      });
      return expect(openwhiskRemove.removeRule(
        { feedName: 'some_feed', namespace: 'test', trigger: 'myTrigger' }
      )).to.eventually.be.resolved;
    });

    it('should reject when feed removal fails to be removed with error message', () => {
      const err = { message: 'some reason' };
      sandbox.stub(ClientFactory, 'fromWskProps', () => Promise.resolve(
        { feeds: { delete: () => Promise.reject(err) } }
      ));
      return expect(openwhiskRemove.removeFeed({ feedName: 'test' }))
        .to.eventually.be.rejectedWith(
          new RegExp(`test.*${err.message}`)
        );
    });
  });
});
