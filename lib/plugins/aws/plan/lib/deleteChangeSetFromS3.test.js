'use strict';
/* eslint-env mocha */
const chai = require('chai');
const sinon = require('sinon');
const deleteChangeSetFromS3 = require('./deleteChangeSetFromS3');

const expect = chai.expect;

describe('AWSPlan deleteChangeSetFromS3', () => {
  describe('#deleteChangeSetFromS3', () => {
    let plugin;

    beforeEach(() => {
      plugin = {};
      plugin.bucketName = 'bucketName';
      plugin.provider = {};
      plugin.provider.naming = {};
      plugin.provider.naming.getChangeSetS3FolderPath = () => 'folder';
      plugin.serverless = {};
      plugin.serverless.service = {};
      plugin.serverless.service.package = {};
      plugin.serverless.service.package.artifactDirectoryName = 'artifactDirectoryName';
    });

    it('should delete a changeset from S3', () => {
      const request = sinon.stub();

      // setup list request
      request
        .withArgs('S3', 'listObjectsV2', {
          Bucket: 'bucketName',
          Prefix: 'artifactDirectoryName',
        })
        .returns(Promise.resolve({ Contents: [{ Key: 'artifactDirectoryName/foo' }] }));

      // setup delete request
      request
        .withArgs('S3', 'deleteObjects', {
          Bucket: 'bucketName',
          Delete: {
            Objects: [{ Key: 'artifactDirectoryName/foo' }, { Key: 'artifactDirectoryName' }],
          },
        })
        .returns(Promise.resolve(true));

      // execute
      plugin.provider.request = request;
      const fn = deleteChangeSetFromS3.deleteChangeSetFromS3.bind(plugin);
      return fn().then(response => {
        expect(response).to.be.true;
      });
    });
  });
});
