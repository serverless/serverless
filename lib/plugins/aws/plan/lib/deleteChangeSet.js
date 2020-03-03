'use strict';

function deleteChangeSet() {
  const stackName = this.provider.naming.getStackName();
  const changeSetName = this.changeSetName;
  return this.provider.request('CloudFormation', 'deleteChangeSet', {
    StackName: stackName,
    ChangeSetName: changeSetName,
  });
}

module.exports = {
  deleteChangeSet,
};
