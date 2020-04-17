'use strict';
/* eslint-env mocha */
const chai = require('chai');
const _ = require('lodash');
const naming = require('./naming');

const expect = chai.expect;

describe('AWSPlan naming', () => {
  let plugin;

  beforeEach(() => {
    plugin = {};
  });

  describe('#getStackName', () => {
    it('should return the stack name', () => {
      _.set(plugin, 'provider.naming.getStackName', () => 'stackName');
      expect(naming.getStackName(plugin)).to.equal('stackName');
    });
  });

  describe('#getChangeSetName', () => {
    it('should return the changeSetName', () => {
      plugin.changeSetName = 'changeSetName';
      expect(naming.getChangeSetName(plugin)).to.equal('changeSetName');
    });
  });

  describe('#getS3BucketName', () => {
    it('should return the S3BucketName', () => {
      plugin.bucketName = 'bucketName';
      expect(naming.getS3BucketName(plugin)).to.equal('bucketName');
    });
  });

  describe('#getChangeSetS3FolderPath', () => {
    it('should return the ChangeSetS3FolderPath', () => {
      _.set(plugin, 'serverless.service.package.artifactDirectoryName', 'foo');
      expect(naming.getChangeSetS3FolderPath(plugin)).to.equal('foo');
    });
  });

  describe('#getChangeSetS3FolderUrl', () => {
    it('should return the ChangeSetS3FolderUrl', () => {
      plugin.bucketName = 'bucketName';
      _.set(plugin, 'serverless.service.package.artifactDirectoryName', 'foo');
      _.set(plugin, 'provider.getRegion', () => 'us-east-1');
      expect(naming.getChangeSetS3FolderUrl(plugin)).to.equal(
        'https://s3.amazonaws.com/bucketName/foo'
      );
    });
  });

  describe('#getChangeSetS3CompiledTemplateUrl', () => {
    it('should return the ChangeSetS3CompiledTemplateUrl', () => {
      plugin.bucketName = 'bucketName';
      _.set(plugin, 'serverless.service.package.artifactDirectoryName', 'foo');
      _.set(plugin, 'provider.naming.getCompiledTemplateS3Suffix', () => 'suffix');
      _.set(plugin, 'provider.getRegion', () => 'us-east-1');
      expect(naming.getChangeSetS3CompiledTemplateUrl(plugin)).to.equal(
        'https://s3.amazonaws.com/bucketName/foo/suffix'
      );
    });
  });
});
