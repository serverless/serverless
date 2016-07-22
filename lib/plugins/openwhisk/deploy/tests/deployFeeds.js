'use strict';

const expect = require('chai').expect;
const OpenWhiskDeploy = require('../index');
const Serverless = require('../../../../Serverless');
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');
const ClientFactory = require('../../util/client_factory');

require('chai').use(chaiAsPromised);

describe('deployFeeds', () => {
  let serverless;
  let openwhiskDeploy;
  let sandbox;

  const mockFeedObject = {
    feeds: {
      myFeed: {
        feedName: 'myFeed',
      },
    },
  };

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    openwhiskDeploy = new OpenWhiskDeploy(serverless, options);
    openwhiskDeploy.serverless.cli = new serverless.classes.CLI();
    openwhiskDeploy.serverless.service.defaults = {
      namespace: 'testing',
      apihost: 'openwhisk.org',
      auth: 'user:pass',
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#deployFeeds()', () => {
    it('should call deployFeed for each registered trigger feed', () => {
      const stub = sandbox.stub(openwhiskDeploy, 'deployFeed', () => {});

      const triggerWithFeed = { feed: { feedName: 'blah' } };
      openwhiskDeploy.serverless.service.triggers
        = { myTrigger: triggerWithFeed, anotherTrigger: {}, finalTrigger: triggerWithFeed };

      return openwhiskDeploy.deployFeeds().then(() => {
        expect(stub.calledTwice).to.be.equal(true);
        expect(stub.calledWith(triggerWithFeed.feed)).to.be.equal(true);
      });
    });
  });

  describe('#deployFeed()', () => {
    it('should deploy feed to openwhisk', () => {
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const create = params => {
          expect(params).to.be.deep.equal(mockFeedObject.feeds.myFeed);
          return Promise.resolve();
        };

        return Promise.resolve({ feeds: { create } });
      });
      return expect(openwhiskDeploy.deployFeed(mockFeedObject.feeds.myFeed))
        .to.eventually.be.resolved;
    });

    it('should reject when function handler fails to deploy with error message', () => {
      const err = { message: 'some reason' };
      sandbox.stub(ClientFactory, 'fromWskProps', () => {
        const create = () => Promise.reject(err);

        return Promise.resolve({ feeds: { create } });
      });
      return expect(openwhiskDeploy.deployFeed(mockFeedObject.feeds.myFeed))
        .to.eventually.be.rejectedWith(
          new RegExp(`${mockFeedObject.feeds.myFeed.feedName}.*${err.message}`)
        );
    });
  });
});
