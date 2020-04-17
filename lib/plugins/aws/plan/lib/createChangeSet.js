'use strict';
const _ = require('lodash');
const naming = require('./naming');

function execute(plugin, changeSetType) {
  const stackName = naming.getStackName(plugin);
  const changeSetName = plugin.changeSetName;
  const templateUrl = naming.getChangeSetS3CompiledTemplateUrl(plugin);

  let stackTags = {
    STAGE: plugin.provider.getStage(),
  };

  // Merge additional stack tags
  if (typeof plugin.serverless.service.provider.stackTags === 'object') {
    stackTags = _.extend(stackTags, plugin.serverless.service.provider.stackTags);
  }

  const params = {
    StackName: stackName,
    ChangeSetName: changeSetName,
    Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
    ChangeSetType: changeSetType,
    Parameters: [],
    TemplateURL: templateUrl,
    Tags: Object.keys(stackTags).map(key => ({
      Key: key,
      Value: stackTags[key],
    })),
  };

  if (plugin.serverless.service.provider.cfnRole) {
    params.RoleARN = plugin.serverless.service.provider.cfnRole;
  }

  return plugin.provider.request('CloudFormation', 'createChangeSet', params);
}

function createChangeSet(changeSetSuffix) {
  changeSetSuffix = changeSetSuffix || Date.now();
  const stackName = this.provider.naming.getStackName();
  const changeSetName = `${stackName}-${changeSetSuffix}`;
  this.changeSetName = changeSetName;
  this.serverless.cli.log(`Creating ChangeSet [${changeSetName}]`);
  return execute(this, 'UPDATE').catch(e => {
    if (e.message.includes('does not exist')) {
      return execute(this, 'CREATE');
    }
    throw e;
  });
}

module.exports = {
  createChangeSet,
};
