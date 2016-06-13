'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileResource() {
    this.paths = [];

    _.forEach(this.serverless.service.functions, (functionObj) => {
      _.forEach(functionObj.events.aws.http_endpoints, (method, pathParam) => {
        let path = pathParam;

        while (path !== '') {
          if (this.paths.indexOf(path) === -1) {
            this.paths.push(path);
            const splittedPath = path.split('/');
            splittedPath.pop();
            path = splittedPath.join('/');
          }
        }
      });
    });

    // ['users', 'users/create', 'users/create/something']
    this.paths.forEach(path => {
      const resourcesArray = path.split('/');

      // resource name is the last element in the endpoint. It's not unique.
      const resourceName = path.split('/')[path.split('/').length - 1];
      const resourcePath = path;
      const resourceIndex = this.paths.indexOf(resourcePath);
      const resourceLogicalId = `ApigResource${resourceIndex}`;
      resourcesArray.pop();

      const resourceParentPath = resourcesArray.join('/');
      const resourceParentIndex = this.paths.indexOf(resourceParentPath);
      const resourceParentLogicalId = `ApigResource${resourceParentIndex}`;

      const resourceTemplate = `
        {
          "Type" : "AWS::ApiGateway::Resource",
          "Properties" : {
            "ParentId" : { "Ref" : "${resourceParentLogicalId}" },
            "PathPart" : ${resourceName},
            "RestApiId" : { "Ref" : "${resourceParentLogicalId}" }
          }
        }
      `;

      const resourceObject = {
        [resourceLogicalId]: JSON.parse(resourceTemplate),
      };

      _.merge(this.serverless.service.resources.aws.Resources,
        resourceObject);

    });

    return BbPromise.resolve();
  },
};
