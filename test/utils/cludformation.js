'use strict';

const awsRequest = require('@serverless/test/aws-request');

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

module.exports = {
  findStacks,
  deleteStack,
  listStackResources,
  listStacks,
};
