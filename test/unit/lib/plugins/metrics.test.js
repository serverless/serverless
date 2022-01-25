'use strict';

const expect = require('chai').expect;
const Metrics = require('../../../../lib/plugins/metrics');
const Serverless = require('../../../../lib/serverless');

describe('Metrics', () => {
  let metrics;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} });
    const options = {};
    metrics = new Metrics(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have the command "metrics"', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(metrics.commands.metrics).to.not.be.undefined;
    });

    it('should have a lifecycle event "metrics"', () => {
      expect(metrics.commands.metrics.lifecycleEvents).to.deep.equal(['metrics']);
    });
  });
});
