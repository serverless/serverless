'use strict';

const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const merge = require('lodash').merge;

module.exports = {
  compileResources() {
    this.resourcePaths = [];
    this.resourceLogicalIds = {};

    forEach(this.serverless.service.functions, (functionObj) => {
      // checking all three levels in the obj tree
      // to avoid "can't read property of undefined" error
      if (functionObj.events && functionObj.events.aws
        && functionObj.events.aws.http_endpoint) {
        forEach(functionObj.events.aws.http_endpoint, (pathParam) => {
          let path = pathParam;
          while (path !== '') {
            if (this.resourcePaths.indexOf(path) === -1) {
              this.resourcePaths.push(path);
            }

            const splittedPath = path.split('/');
            splittedPath.pop();
            path = splittedPath.join('/');
          }
        });
      }
    });

    // ['users', 'users/create', 'users/create/something']
    this.resourcePaths.forEach(path => {
      const resourcesArray = path.split('/');
      // resource name is the last element in the endpoint. It's not unique.
      const resourceName = path.split('/')[path.split('/').length - 1];
      const resourcePath = path;
      const resourceIndex = this.resourcePaths.indexOf(resourcePath);
      const resourceLogicalId = `ResourceApigEvent${resourceIndex}`;
      this.resourceLogicalIds[resourcePath] = resourceLogicalId;
      resourcesArray.pop();

      let resourceParentId;
      if (resourcesArray.length === 0) {
        resourceParentId = '{ "Fn::GetAtt": ["RestApiApigEvent", "RootResourceId"] }';
      } else {
        const resourceParentPath = resourcesArray.join('/');
        const resourceParentIndex = this.resourcePaths.indexOf(resourceParentPath);
        resourceParentId = `{ "Ref" : "ResourceApigEvent${resourceParentIndex}" }`;
      }

      const resourceTemplate = `
        {
          "Type" : "AWS::ApiGateway::Resource",
          "Properties" : {
            "ParentId" : ${resourceParentId},
            "PathPart" : "${resourceName}",
            "RestApiId" : { "Ref" : "RestApiApigEvent" }
          }
        }
      `;

      const resourceObject = {
        [resourceLogicalId]: JSON.parse(resourceTemplate),
      };

      merge(this.serverless.service.resources.aws.Resources,
        resourceObject);
    });

    return BbPromise.resolve();
  },
};
