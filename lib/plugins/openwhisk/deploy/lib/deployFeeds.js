'use strict';

const BbPromise = require('bluebird');
const ClientFactory = require('../../util/client_factory');

module.exports = {
  deployFeed(feed) {
    return ClientFactory.fromWskProps().then(ow =>
      ow.feeds.create(feed).catch(err => {
        throw new this.serverless.classes.Error(
          `Failed to deploy feed (${feed.feedName}) due to error: ${err.message}`
        );
      })
    );
  },

  deployFeeds() {
    this.serverless.cli.log('Binding Feeds To Triggers...');
    const triggers = this.serverless.service.triggers;
    return BbPromise.all(
      Object.keys(triggers)
        .map(t => triggers[t].feed)
        .filter(f => f)
        .map(feed => this.deployFeed(feed))
    );
  },
};
