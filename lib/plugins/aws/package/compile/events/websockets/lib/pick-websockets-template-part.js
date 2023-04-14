'use strict';

const _ = require('lodash');
const _get = require('../../../../../../../utils/purekit/get');

module.exports = (cfTemplate, token) =>
  _.pickBy(cfTemplate.Resources, (resource, resourceKey) => {
    if (resourceKey === token) return true;
    if (_get(resource, 'Properties.ApiId.Ref') === token) return true;
    if (
      resource &&
      resource.DependsOn &&
      Array.isArray(resource.DependsOn) &&
      resource.DependsOn.includes(token)
    ) {
      return true;
    }
    return false;
  });
