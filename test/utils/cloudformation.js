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

async function getStackOutputMap(name) {
  const describeStackResponse = await awsRequest('CloudFormation', 'describeStacks', {
    StackName: name,
  });

  const outputsMap = new Map();
  for (const { OutputKey: key, OutputValue: value } of describeStackResponse.Stacks[0].Outputs) {
    outputsMap.set(key, value);
  }
  return outputsMap;
}

async function isDependencyStackAvailable() {
  const validStatuses = ['CREATE_COMPLETE', 'UPDATE_COMPLETE'];

  try {
    const describeStacksResponse = await awsRequest('CloudFormation', 'describeStacks', {
      StackName: SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
    });
    if (validStatuses.includes(describeStacksResponse.Stacks[0].StackStatus)) {
      return true;
    }
    return false;
  } catch (e) {
    if (e.code === 'ValidationError') {
      return false;
    }
    throw e;
  }
}

async function getDependencyStackOutputMap() {
  return getStackOutputMap(SHARED_INFRA_TESTS_CLOUDFORMATION_STACK);
}

module.exports = {
  findStacks,
  deleteStack,
  listStackResources,
  listStacks,
  getStackOutputMap,
  SHARED_INFRA_TESTS_CLOUDFORMATION_STACK,
  isDependencyStackAvailable,
  getDependencyStackOutputMap,
};
