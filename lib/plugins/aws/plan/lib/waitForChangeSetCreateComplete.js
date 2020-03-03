'use strict';

const AWS = require('aws-sdk');
const naming = require('./naming');

function waitForChangeSetCreateComplete() {
    const credentials = Object.assign({}, this.provider.getCredentials());
    credentials.region = this.provider.getRegion();
    const cf = new AWS.CloudFormation(credentials);
    return cf.waitFor('changeSetCreateComplete',{
        StackName: naming.getStackName(this),
        ChangeSetName: naming.getChangeSetName(this)
    }).promise();
}

module.exports = {
    waitForChangeSetCreateComplete
}