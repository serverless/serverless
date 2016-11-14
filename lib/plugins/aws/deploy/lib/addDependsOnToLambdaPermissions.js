'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  addDependsOnToLambdaPermissions() {
    const template = this.serverless.service.provider.compiledCloudFormationTemplate;

    let dependsOn = null;
    _.forEach(template.Resources, (value, key) => {
      const resource = value;
      if (resource.Type === 'AWS::Lambda::Permission') {
        if (dependsOn !== null) {
          if (Array.isArray(resource.DependsOn)) {
            resource.DependsOn = _.union(resource.DependsOn, [dependsOn]);
          } else {
            resource.DependsOn = [dependsOn];
          }
        }
        dependsOn = key;
      }
    });

    return BbPromise.resolve();
  },
};
