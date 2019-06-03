'use strict';

const AWS = require('aws-sdk');
const { region, persistentRequest } = require('../misc');

function findStacks(name, status) {
  const CF = new AWS.CloudFormation({ region });

  const params = {};
  if (status) {
    params.StackStatusFilter = status;
  }

  function recursiveFind(found, token) {
    if (token) params.NextToken = token;
    return CF.listStacks(params).promise().then(result => {
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
  const CF = new AWS.CloudFormation({ region });

  const params = {
    StackName: stack,
  };

  return CF.deleteStack(params).promise();
}

function listStackResources(stack) {
  const CF = new AWS.CloudFormation({ region });

  const params = {
    StackName: stack,
  };

  function recursiveFind(resources, token) {
    if (token) params.NextToken = token;
    return CF.listStackResources(params).promise().then(result => {
      resources.push(...result.StackResourceSummaries);
      if (result.NextToken) return recursiveFind(resources, result.NextToken);
      return resources;
    });
  }

  return recursiveFind([]);
}

function listStacks(status) {
  const CF = new AWS.CloudFormation({ region });

  const params = {};
  if (status) {
    params.StackStatusFilter = status;
  }

  return CF.listStacks(params).promise();
}

module.exports = {
  findStacks: persistentRequest.bind(this, findStacks),
  deleteStack: persistentRequest.bind(this, deleteStack),
  listStackResources: persistentRequest.bind(this, listStackResources),
  listStacks: persistentRequest.bind(this, listStacks),
};
