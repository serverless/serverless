'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  deployFeed(feed) {
    return ClientFactory.fromWskProps().then(ow => {
      return ow.actions.create(feed).catch(err => {
        throw new this.serverless.classes.Error(
          `Failed to deploy feed (${feed.feedName}) due to error: ${err.message}`
        );
      });
    });
  },

  deployFeeds() {
    this.serverless.cli.log('Binding Feeds To Triggers...');
    // need to get feeds from triggers.....
    const feeds = this.serverless.service.feeds;
    return BbPromise.all(
      Object.keys(feeds).map(t => this.deployFeed(feeds[t]))
    );
  },
};
