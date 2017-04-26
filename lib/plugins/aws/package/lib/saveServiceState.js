'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');

/**
 * Find all self references within a given object.
 * The search is implemented non-recursive to prevent stackoverflows and will
 * do a complete deep search including arrays.
 * @param root {Object} Root object for search
 * @param self {Object} Object reference to be treated as self
 * @returns {Array<String>} Paths to all self references found within the object
 */
function findSelfReferences(root, self) {
  const resourcePaths = [];
  const stack = [{ parent: null, value: root, path: '' }];

  while (!_.isEmpty(stack)) {
    const property = stack.pop();

    _.forOwn(property.value, (value, key) => {
      if (value === self) {
        resourcePaths.push(`${property.path}.${key}`);
      } else if (_.isObject(value)) {
        let propKey;
        if (_.isArray(property.value)) {
          propKey = `[${key}]`;
        } else {
          propKey = _.isEmpty(property.path) ? `${key}` : `.${key}`;
        }
        stack.push({ parent: property, value, path: `${property.path}${propKey}` });
      }
    });
  }

  return resourcePaths;
}

module.exports = {
  saveServiceState() {
    const serviceStateFileName = this.provider.naming.getServiceStateFileName();

    const serviceStateFilePath = path.join(
      this.serverless.config.servicePath,
      '.serverless',
      serviceStateFileName
    );

    const artifact = _.last(
      _.split(
        _.get(this.serverless.service, 'package.artifact', ''), path.sep
      )
    );

    const strippedService = _.assign(
      {}, _.omit(this.serverless.service, ['serverless', 'package'])
    );
    const selfReferences = findSelfReferences(strippedService, this.serverless.service);
    _.forEach(selfReferences, refPath => _.set(strippedService, refPath, '${self:}'));

    const state = {
      service: strippedService,
      package: {
        individually: this.serverless.service.package.individually,
        artifactDirectoryName: this.serverless.service.package.artifactDirectoryName,
        artifact,
      },
    };

    this.serverless.utils.writeFileSync(serviceStateFilePath, state);

    return BbPromise.resolve();
  },
};
