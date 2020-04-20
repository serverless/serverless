'use strict';
const BbPromise = require('bluebird');
const printer = require('./analysisPrinter');
const naming = require('./naming');

function describeStack(provider, stackName) {
  return provider.request('CloudFormation', 'describeStacks', { StackName: stackName });
}

function describeChangeSet(provider, stackName, changeSetName) {
  return provider.request('CloudFormation', 'describeChangeSet', {
    StackName: stackName,
    ChangeSetName: changeSetName,
  });
}

function runAnalysis() {
  const stackName = naming.getStackName(this);
  const changeSetName = this.changeSetName;
  const logger = {
    log: msg => {
      this.serverless.cli.log(`${msg}\n`);
    },
  };
  return BbPromise.all([
    describeStack(this.provider, stackName),
    describeChangeSet(this.provider, stackName, changeSetName),
  ]).then(([stacks, changeSet]) => {
    printer.print(logger, stacks.Stacks[0], changeSet);
  });
}

module.exports = {
  runAnalysis,
};
