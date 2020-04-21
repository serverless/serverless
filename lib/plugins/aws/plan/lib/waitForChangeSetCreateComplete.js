'use strict';

const AWS = require('aws-sdk');
const naming = require('./naming');

function waitForChangeSetCreateComplete() {
  const credentials = Object.assign({}, this.provider.getCredentials());
  credentials.region = this.provider.getRegion();
  const cf = new AWS.CloudFormation(credentials);
  const stackName = naming.getStackName(this);
  return cf
    .waitFor('changeSetCreateComplete', {
      StackName: stackName,
      ChangeSetName: this.changeSetName,
    })
    .promise()
    .catch(error => {
      // check if there are not changes
      return this.provider
        .request('CloudFormation', 'describeChangeSet', {
          StackName: stackName,
          ChangeSetName: this.changeSetName,
        })
        .then(response => {
          const reason = response.StatusReason || '';
          if (reason.includes("didn't contain changes")) {
            return;
          }
          throw error;
        });
    });
}

module.exports = {
  waitForChangeSetCreateComplete,
};
