'use strict';
/* eslint-env mocha */
const chai = require('chai');
const _ = require('lodash');
const sinon = require('sinon');
const runAnalysis = require('./runAnalysis');

const expect = chai.expect;

describe('AWSPlan runAnalysis', () => {
  let plugin;

  beforeEach(() => {
    plugin = {};
  });

  describe('#runAnalysis', () => {
    it('should run the changeSetAnalysis', () => {
      _.set(plugin, 'provider.getRegion', () => 'us-east-1');
      _.set(plugin, 'provider.naming.getStackName', () => 'stackName');
      _.set(plugin, 'changeSetName', 'changeSetName');
      const log = sinon.stub();
      _.set(plugin, 'serverless.cli.log', log);
      const request = sinon.stub();
      _.set(plugin, 'provider.request', request);
      request
        .withArgs(
          'CloudFormation',
          'describeStacks',
          { StackName: 'stackName' },
          { region: 'us-east-1' }
        )
        .returns(Promise.resolve({ Stacks: [{ Parameters: [], Tags: [] }] }));
      request
        .withArgs(
          'CloudFormation',
          'describeChangeSet',
          { StackName: 'stackName', ChangeSetName: 'changeSetName' },
          { region: 'us-east-1' }
        )
        .returns(
          Promise.resolve({
            StackName: 'aws-sls-dev',
            Parameters: [],
            Tags: [],
            Changes: [],
          })
        );
      return runAnalysis.runAnalysis
        .bind(plugin)()
        .then(() => {
          sinon.assert.calledTwice(request);
          sinon.assert.calledOnce(log);
          expect(log.getCall(0).args[0]).to.have.string('Resource Changes');
        });
    });
  });
});
