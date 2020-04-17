'use strict';
/* eslint-env mocha */
const chai = require('chai');
const _ = require('lodash');
const sinon = require('sinon');
const createChangeSet = require('./createChangeSet');

const expect = chai.expect;

describe('AWSPlan createChangeSet', () => {
  describe('#createChangeSet', () => {
    let plugin = {};

    beforeEach(() => {
      plugin = {};
      _.set(plugin, 'bucketName', 'bucketName');
      _.set(plugin, 'provider.getStage', () => 'dev');
      _.set(plugin, 'provider.naming.getStackName', () => 'stackName');
      _.set(
        plugin,
        'provider.naming.getCompiledTemplateS3Suffix',
        () => 'changeSetName/compiled-template.json'
      );
      _.set(plugin, 'serverless.cli.log', () => {});
      _.set(
        plugin,
        'serverless.service.package.artifactDirectoryName',
        'serverless/dev/artifactname'
      );
      _.set(plugin, 'serverless.service.provider', plugin.provider);
    });

    it('should create a new changeset', () => {
      const request = sinon.fake.returns(Promise.resolve(true));
      _.set(plugin, 'provider.request', request);
      const fn = createChangeSet.createChangeSet.bind(plugin);
      return fn('changeSetSuffix').then(response => {
        sinon.assert.calledOnce(request);
        sinon.assert.calledWith(request, 'CloudFormation', 'createChangeSet', {
          StackName: 'stackName',
          ChangeSetName: 'stackName-changeSetSuffix',
          Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
          ChangeSetType: 'UPDATE',
          Parameters: [],
          TemplateURL:
            'https://s3.amazonaws.com/bucketName/serverless/dev/artifactname/changeSetName/compiled-template.json',
          Tags: [
            {
              Key: 'STAGE',
              Value: 'dev',
            },
          ],
        });
        expect(response).to.be.true;
      });
    });
  });
});
