'use strict';

const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');
const traverse = require('traverse');
const DepGraph = require('dependency-graph').DepGraph;

module.exports = {
  splitStack() {
    if (!this.serverless.service.provider.useStackSplitting) return BbPromise.resolve();

    this.serverless.service.provider.cloudFormationDependencyGraph = null;
    this.serverless.service.provider.nestedStacks = [];

    return BbPromise.bind(this)
      .then(this.createDependencyGraph)
      .then(this.generateNestedStacks)
      .then(this.writeStacksToDisk)
      .then(this.updateCompiledCloudFormationTemplate);
  },

  createDependencyGraph() {
    const items = this.serverless.service.provider.compiledCloudFormationTemplate;

    const resources = items.Resources;
    const resourcesLogicalIds = Object.keys(resources);
    const outputs = items.Outputs;
    const outputsLogicalIds = Object.keys(outputs);
    const allLogicalIds = _.union(resourcesLogicalIds, outputsLogicalIds);

    const graph = new DepGraph();

    traverse(items).forEach(function (prop) {
      // add all the resources and outputs to the graph
      // note: this.path looks something like this --> ['Resources', 'ResourceLogicalId', ...]
      const type = this.path[0] === 'Resources' ? 'resource' : 'output';
      const name = this.path[1];
      if ((type === 'resource' || type === 'output') && this.path.length === 2) {
        graph.addNode(name);
      }

      // create the dependencies
      // remove the first two items from this.path since they'll be something
      // like ['Resources', 'ResourceLogicalId', ...] to filter out dependencies by key
      const subPath = this.path.slice(2, this.path.length);
      if (subPath.length && _.isString(prop)) {
        if (allLogicalIds.includes(prop)) {
          const dependantName = name;
          const dependencyName = prop;

          graph.addDependency(dependantName, dependencyName);
        }
      }
    });

    this.serverless.service.provider.cloudFormationDependencyGraph = graph;

    return BbPromise.resolve();
  },

  generateNestedStacks() {
    const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const depGraph = this.serverless.service.provider.cloudFormationDependencyGraph;

    const functionResourceLogicalIds = [];

    _.forEach(cfTemplate.Resources, (resource, logicalId) => {
      if (resource.Type === 'AWS::Lambda::Function') {
        functionResourceLogicalIds.push(logicalId);
      }
    });

    _.forEach(functionResourceLogicalIds, (funcLogicalId, index) => {
      const stackObj = {
        stackTemplate: {},
        stackResource: {},
      };

      const lambdaLogicalIdRegex = this.provider.naming.getLambdaLogicalIdRegex();
      const normalizedFuncNameEnd = lambdaLogicalIdRegex.exec(funcLogicalId).index;
      const normalizedFuncName = funcLogicalId.slice(0, normalizedFuncNameEnd);

      const description = `Stack for function "${funcLogicalId}" and its dependencies`;

      // create the stack template (the template which contains the function and related resources)
      const newStackTemplate = this.cfStackTemplate();
      newStackTemplate.Description = description;
      // add the function
      newStackTemplate.Resources[funcLogicalId] = cfTemplate.Resources[funcLogicalId];
      // add the log group
      const logGroupLogicalIdSuffix = this.provider.naming.getLogGroupLogicalIdSuffix();
      const logGroupLogicalId = `${normalizedFuncName}${logGroupLogicalIdSuffix}`;
      newStackTemplate.Resources[logGroupLogicalId] = cfTemplate.Resources[logGroupLogicalId];
      // add all the dependant resources
      const depResources = depGraph.dependantsOf(funcLogicalId);
      _.forEach(depResources, (depLogicalId) => {
        newStackTemplate.Resources[depLogicalId] = cfTemplate.Resources[depLogicalId];
      });

      stackObj.stackTemplate = newStackTemplate;

      // create the (nested) stack resource
      const newStackResource = this.cfStackResourceTemplate();

      const stackId = index + 1;
      const fileName = `cloudformation-template-nested-stack-${stackId}.json`;
      const resourceLogicalId = `NestedStack${stackId}`; // TODO move this to provider.naming
      const templateURL = `https://s3.amazonaws.com/${
        this.bucketName
        }/${
          this.serverless.service.package.artifactDirectoryName
        }/${
          fileName
        }`;

      newStackResource.Description = description;
      newStackResource.Properties.TemplateURL = templateURL;

      const newStackResourceObj = {
        [resourceLogicalId]: newStackResource,
      };

      stackObj.stackResource = newStackResourceObj;

      this.serverless.service.provider.nestedStacks.push(stackObj);
    });

    return BbPromise.resolve();
  },

  writeStacksToDisk() {
    const nestedStacks = this.serverless.service.provider.nestedStacks;

    _.forEach(nestedStacks, (nestedStack) => {
      const stackResource = nestedStack.stackResource;
      const stackTemplate = nestedStack.stackTemplate;

      const logicalId = Object.keys(stackResource)[0];
      const fileName = stackResource[logicalId].Properties.TemplateURL.split('/').pop();
      const destPath = path.join(
        this.serverless.config.servicePath,
        '.serverless',
        fileName
      );

      this.serverless.utils.writeFileSync(destPath, stackTemplate);
    });

    return BbPromise.resolve();
  },

  updateCompiledCloudFormationTemplate() {
    const cfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const nestedStacks = this.serverless.service.provider.nestedStacks;

    _.forEach(nestedStacks, (nestedStack) => {
      const stackResource = nestedStack.stackResource;
      const stackTemplate = nestedStack.stackTemplate;

      // remove resources from parent stack since they are alraedy in nested stack
      const resourcesToRemove = stackTemplate.Resources;

      _.forEach(resourcesToRemove, (resource, logicalId) => {
        delete cfTemplate.Resources[logicalId];
      });

      // add the stack Resources to parent stack
      const logicalId = Object.keys(stackResource)[0];
      cfTemplate.Resources[logicalId] = stackResource;
    });

    return BbPromise.resolve();
  },

  // CloudFormation templates
  cfStackTemplate() {
    return {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'Stack template',
      Resources: {},
      Outputs: {},
    };
  },

  cfStackResourceTemplate() {
    return {
      Type: 'AWS::CloudFormation::Stack',
      Properties: {
        TemplateURL: '',
      },
    };
  },
};
