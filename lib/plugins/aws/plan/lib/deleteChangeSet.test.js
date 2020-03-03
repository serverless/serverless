// Copyright (c) 2017 Sami Jaktholm <sjakthol@outlook.com>
'use strict';
/* eslint-env mocha */
const chai = require('chai');
const sinon = require('sinon');
const deleteChangeSet = require('./deleteChangeSet');

const expect = chai.expect;

describe('AWSPlan deleteChangeSet', () => {
  describe('#deleteChangeSet', () => {
    let plugin;

    beforeEach(() => {
      plugin = {};
      plugin.provider = {};
      plugin.provider.naming = {};
      plugin.provider.naming.getStackName = () => 'stackName';
      plugin.changeSetName = 'changeSetName';
    });

    it('should delete a changeset2', () => {
      const request = sinon.stub();
      request
        .withArgs('CloudFormation', 'deleteChangeSet', {
          StackName: 'stackName',
          ChangeSetName: 'changeSetName',
        })
        .returns(true);
      plugin.provider.request = request;
      const fn = deleteChangeSet.deleteChangeSet.bind(plugin);
      const response = fn();
      expect(response).to.be.true;
    });
  });
});
