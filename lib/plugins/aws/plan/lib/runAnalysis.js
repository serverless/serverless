'use strict';
const BbPromise = require('bluebird');
const printer = require('./analysisPrinter');
const naming = require('./naming');

function describeStack(provider, stackName, region) {
  return provider.request('CloudFormation', 'describeStacks', { StackName: stackName }, { region });
}

function describeChangeSet(provider, stackName, changeSetName, region) {
  return provider.request(
    'CloudFormation',
    'describeChangeSet',
    { StackName: stackName, ChangeSetName: changeSetName },
    { region }
  );
}

function runAnalysis() {
  const region = this.provider.getRegion();
  const stackName = naming.getStackName(this);
  const changeSetName = this.changeSetName;
  const logger = {
    log: msg => {
      this.serverless.cli.log(`${msg}\n`);
    },
  };
  return BbPromise.all([
    describeStack(this.provider, stackName, region),
    describeChangeSet(this.provider, stackName, changeSetName, region),
  ]).then(([stacks, changeSet]) => {
    printer.print(logger, stacks.Stacks[0], changeSet);
  });
}

module.exports = {
  runAnalysis,
};
