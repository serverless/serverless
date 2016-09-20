'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileResources() {
    this.resourceFunctions = [];
    this.resourcePaths = [];
    this.resourceLogicalIds = {};

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach(event => {
        if (event.http) {
          let path;

          if (typeof event.http === 'object') {
            path = event.http.path;
          } else if (typeof event.http === 'string') {
            path = event.http.split(' ')[1];
          } else {
            const errorMessage = [
              `HTTP event of function ${functionName} is not an object nor a string.`,
              ' The correct syntax is: http: get users/list',
              ' OR an object with "path" and "method" proeprties.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          while (path !== '') {
            if (this.resourcePaths.indexOf(path) === -1) {
              this.resourcePaths.push(path);
              this.resourceFunctions.push(functionName);
            }

            const splittedPath = path.split('/');
            splittedPath.pop();
            path = splittedPath.join('/');
          }
        }
      });
    });

    const capitalizeAlphaNumericPath = (path) => _.capitalize(path.replace(/[^0-9A-Za-z]/g, ''));

    // ['users', 'users/create', 'users/create/something']
    this.resourcePaths.forEach(path => {
      const resourcesArray = path.split('/');
      // resource name is the last element in the endpoint. It's not unique.
      const resourceName = path.split('/')[path.split('/').length - 1];
      const resourcePath = path;
      const normalizedResourceName = resourcesArray.map(capitalizeAlphaNumericPath).join('');
      const resourceLogicalId = `ApiGatewayResource${normalizedResourceName}`;
      this.resourceLogicalIds[resourcePath] = resourceLogicalId;
      resourcesArray.pop();

      let resourceParentId;
      if (resourcesArray.length === 0) {
        resourceParentId = '{ "Fn::GetAtt": ["ApiGatewayRestApi", "RootResourceId"] }';
      } else {
        const normalizedResourceParentName = resourcesArray
          .map(capitalizeAlphaNumericPath).join('');
        resourceParentId = `{ "Ref" : "ApiGatewayResource${normalizedResourceParentName}" }`;
      }

      const resourceTemplate = `
        {
          "Type" : "AWS::ApiGateway::Resource",
          "Properties" : {
            "ParentId" : ${resourceParentId},
            "PathPart" : "${resourceName}",
            "RestApiId" : { "Ref" : "ApiGatewayRestApi" }
          }
        }
      `;

      const resourceObject = {
        [resourceLogicalId]: JSON.parse(resourceTemplate),
      };

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        resourceObject);
    });

    return BbPromise.resolve();
  },
};
