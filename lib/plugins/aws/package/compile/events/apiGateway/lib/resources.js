'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

  compileResources() {
    this.apiGatewayResources = this.getResourcePaths();

    // ['users', 'users/create', 'users/create/something']
    _.keys(this.apiGatewayResources).forEach((path) => {
      const resource = this.apiGatewayResources[path];
      if (resource.resourceId) {
        return;
      }

      resource.resourceLogicalId = this.provider.naming.getResourceLogicalId(path);
      resource.resourceId = { Ref: resource.resourceLogicalId };

      const parentRef = resource.parent
        ? resource.parent.resourceId : this.getResourceId();

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [resource.resourceLogicalId]: {
          Type: 'AWS::ApiGateway::Resource',
          Properties: {
            ParentId: parentRef,
            PathPart: resource.pathPart,
            RestApiId: this.provider.getApiGatewayRestApiId(),
          },
        },
      });
    });

    return BbPromise.resolve();
  },

  combineResourceTrees(trees) {
    const self = this;

    function getNodePaths(result, node) {
      const r = result;
      r[node.path] = node;
      if (!node.name) {
        r[node.path].name = self.provider.naming.normalizePath(node.path);
      }

      node.children.forEach((child) => getNodePaths(result, child));
    }

    return _.reduce(trees, (result, tree) => {
      getNodePaths(result, tree);
      return result;
    }, {});
  },

  getResourcePaths() {
    const trees = [];
    const predefinedResourceNodes = [];
    const methodNodes = [];
    const predefinedResources = this.provider.getApiGatewayPredefinedResources();


    function cutBranch(node) {
      if (!node.parent) {
        return;
      }

      const n = node;
      if (node.parent.children.length <= 1) {
        n.parent.children = [];
      } else {
        n.parent.children = node.parent.children.filter((c) => c.path !== n.path);
        n.parent.isCut = true;
      }
      n.parent = null;
    }

    // organize all resource paths into N-ary tree
    function applyResource(resource, isMethod) {
      let root;
      let parent;
      let currentPath;
      const path = resource.path.replace(/^\//, '').replace(/\/$/, '');
      const pathParts = path.split('/');

      function applyNodeResource(node, parts, index) {
        const n = node;
        if (index === parts.length - 1) {
          n.name = resource.name;
          if (resource.resourceId) {
            n.resourceId = resource.resourceId;
            if (_.every(predefinedResourceNodes, (iter) => iter.path !== n.path)) {
              predefinedResourceNodes.push(node);
            }
          }
          if (isMethod && !node.hasMethod) {
            n.hasMethod = true;
            if (_.every(methodNodes, (iter) => iter.path !== n.path)) {
              methodNodes.push(node);
            }
          }
        }

        parent = node;
      }

      pathParts.forEach((pathPart, index) => {
        currentPath = currentPath ? `${currentPath}/${pathPart}` : pathPart;
        root = root || _.find(trees, (node) => node.path === currentPath);
        parent = parent || root;

        let node;
        if (parent) {
          if (parent.path === currentPath) {
            applyNodeResource(parent, pathParts, index);
            return;
          } else if (parent.children.length > 0) {
            node = _.find(parent.children, (n) => n.path === currentPath);
            if (node) {
              applyNodeResource(node, pathParts, index);
              return;
            }
          }
        }

        node = {
          path: currentPath,
          pathPart,
          parent,

          level: index,
          children: [],
        };

        if (parent) {
          parent.children.push(node);
        }

        if (!root) {
          root = node;
          trees.push(root);
        }

        applyNodeResource(node, pathParts, index);
      });
    }

    predefinedResources.forEach(applyResource);
    this.validated.events.forEach((event) => {
      if (event.http.path) {
        applyResource(event.http, true);
      }
    });

    // if predefinedResources array is empty, return all paths
    if (predefinedResourceNodes.length === 0) {
      return this.combineResourceTrees(trees);
    }

    // if all methods have resource ID already, no need to validate resource trees
    if (_.every(this.validated.events, (event) =>
        _.some(predefinedResourceNodes, (node) =>
          node.path === event.http.path))) {
      return _.reduce(predefinedResources, (resourceMap, resource) => {
        const r = resourceMap;
        r[resource.path] = resource;

        if (!resource.name) {
          r[resource.path].name = this.provider.naming.normalizePath(resource.path);
        }
        return r;
      }, {});
    }

    // cut resource branches from trees
    const sortedResourceNodes = _.sortBy(predefinedResourceNodes,
      node => node.level);
    const validatedTrees = [];

    for (let i = sortedResourceNodes.length - 1; i >= 0; i--) {
      const node = sortedResourceNodes[i];
      let parent = node;

      while (parent && parent.parent) {
        if (parent.parent.hasMethod && !parent.parent.resourceId) {
          throw new Error(`Resource ID for path ${parent.parent.path} is required`);
        }

        if (parent.parent.resourceId || parent.parent.children.length > 1) {
          cutBranch(parent);
          break;
        }

        parent = parent.parent;
      }
    }

    // get branches that begin from root resource
    methodNodes.forEach((node) => {
      let iter = node;
      while (iter) {
        if (iter.resourceId) {
          cutBranch(iter);
          if (_.every(validatedTrees, (t) => t.path !== node.path)) {
            validatedTrees.push(iter);
          }

          break;
        }

        if (iter.isCut || (!iter.parent && iter.level > 0)) {
          throw new Error(`Resource ID for path ${iter.path} is required`);
        }

        if (!iter.parent) {
          validatedTrees.push(iter);
          break;
        }

        iter = iter.parent;
      }
    });

    return this.combineResourceTrees(validatedTrees);
  },

  getResourceId(path) {
    if (!path) {
      return this.provider.getApiGatewayRestApiRootResourceId();
    }

    if (!this.apiGatewayResources || !this.apiGatewayResources[path]) {
      throw new Error(`Can not find API Gateway resource from path ${path}`);
    }

    if (!this.apiGatewayResources[path].resourceId
      && this.apiGatewayResources[path].resourceLogicalId) {
      this.apiGatewayResources[path].resourceId =
          { Ref: this.apiGatewayResources[path].resourceLogicalId };
    }
    return this.apiGatewayResources[path].resourceId;
  },

  getResourceName(path) {
    if (path === '' || !this.apiGatewayResources) {
      return '';
    }

    return this.apiGatewayResources[path].name;
  },
};
