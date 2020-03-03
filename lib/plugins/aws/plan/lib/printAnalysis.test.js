'use strict';
/* eslint-env mocha */
const _ = require('lodash');
const sinon = require('sinon');
const printAnalysis = require('./printAnalysis');

describe('AWSPlan printAnalysis', () => {
  let plugin;

  beforeEach(() => {
    plugin = {};
  });

  describe('#printAnalysis', () => {
    it('should print te message', () => {
      const log = sinon.spy();
      _.set(plugin, 'analysis', 'foo');
      _.set(plugin, 'serverless.cli.log', log);
      printAnalysis.printAnalysis.bind(plugin)();
      sinon.assert.calledOnce(log);
      sinon.assert.calledWith(log, 'foo');
    });
  });
});
