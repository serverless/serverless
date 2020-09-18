'use strict';

const awsRequest = require('@serverless/test/aws-request');

const SHARED_INFRA_TESTS_CLOUDFORMATION_STACK = 'integration-tests-deps-stack';

function findStacks(name, status) {
  const params = {};
  if (status) {
    params.StackStatusFilter = status;
  }

  function recursiveFind(found, token) {
    if (token) params.NextToken = token;
    return awsRequest('CloudFormation', 'listStacks', params).then(result => {
      const matches = result.StackSummaries.filter(stack => stack.StackName.match(name));
      if (matches.length) {
        found.push(...matches);
      }
      if (result.NextToken) return recursiveFind(found, result.NextToken);
      return found;
    });
  }

  return recursiveFind([]);
}

function deleteStack(stack) {
  const params = {
    StackName: stack,
  };

  return awsRequest('CloudFormation', 'deleteStack', params);
}

function listStackResources(stack) {
  const params = {
    StackName: stack,
  };

  function recursiveFind(resources, token) {
    if (token) params.NextToken = token;
    return awsRequest('CloudFormation', 'listStackResources', params).then(result => {
      resources.push(...result.StackResourceSummaries);
      if (result.NextToken) return recursiveFind(resources, result.NextToken);
      return resources;
    });
  }

  return recursiveFind([]);
}

function listStacks(status) {
  const params = {};
  if (status) {
    params.StackStatusFilter = status;
  }

  return awsRequest('CloudFormation', 'listStacks', params);
}

async function doesStackWithNameAndStatusExists(name, status) {
  try {
    const describeStacksResponse = await awsRequest('CloudFormation', 'describeStacks', {
      StackName: name,
    });
    if (describeStacksResponse.Stacks[0].StackStatus === status) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function getStackOutputMap(name) {
  const describeStackResponse = await awsRequest('CloudFormation', 'describeStacks', {
    StackName: name,
  });

  return describeStackResponse.Stacks[0].Outputs.reduce((map, output) => {
    map[output.OutputKey] = output.OutputValue;
    return map;
  }, {});
}

async function isDependencyStackAvailable() {
  return doesStackWithNameAndStatusExists(
    SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
    'CREATE_COMPLETE'
  );
}

async function getDependencyStackOutputMap() {
  return getStackOutputMap(SHARED_INFRA_TESTS_CLOUDFORMATION_STACK);
}

module.exports = {
  findStacks,
  deleteStack,
  listStackResources,
  listStacks,
  doesStackWithNameAndStatusExists,
  getStackOutputMap,
  SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  isDependencyStackAvailable,
  getDependencyStackOutputMap,
};
