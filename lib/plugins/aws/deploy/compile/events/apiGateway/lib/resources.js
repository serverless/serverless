'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

  compileResources() {
    const resourcePaths = this.getResourcePaths();

    this.apiGatewayResourceNames = {};
    this.apiGatewayResourceLogicalIds = {};

    // ['users', 'users/create', 'users/create/something']
    resourcePaths.forEach(path => {
      const pathArray = path.split('/');
      const resourceName = this.provider.naming.normalizePath(path);
      const resourceLogicalId = this.provider.naming.getResourceLogicalId(path);
      const pathPart = pathArray.pop();
      const parentPath = pathArray.join('/');
      const parentRef = this.getResourceId(parentPath);

      this.apiGatewayResourceNames[path] = resourceName;
      this.apiGatewayResourceLogicalIds[path] = resourceLogicalId;

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [resourceLogicalId]: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            ParentId: parentRef,
            PathPart: pathPart,
            RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
          },
        },
      });
    });
    return BbPromise.resolve();
  },

  getResourcePaths() {
    const paths = _.reduce(this.validated.events, (resourcePaths, event) => {
      let path = event.http.path;

      while (path !== '') {
        if (resourcePaths.indexOf(path) === -1) {
          resourcePaths.push(path);
        }

        const splittedPath = path.split('/');
        splittedPath.pop();
        path = splittedPath.join('/');
      }
      return resourcePaths;
    }, []);
    // (stable) sort so that parents get processed before children
    return _.sortBy(paths, path => path.split('/').length);
  },

  getResourceId(path) {
    if (path === '') {
      return { 'Fn::GetAtt': [this.apiGatewayRestApiLogicalId, 'RootResourceId'] };
    }
    return { Ref: this.apiGatewayResourceLogicalIds[path] };
  },

  getResourceName(path) {
    if (path === '') {
      return '';
    }
    return this.apiGatewayResourceNames[path];
  },
};
