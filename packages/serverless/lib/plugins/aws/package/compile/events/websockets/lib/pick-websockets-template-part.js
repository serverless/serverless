import _ from 'lodash'

export default (cfTemplate, token) =>
  _.pickBy(cfTemplate.Resources, (resource, resourceKey) => {
    if (resourceKey === token) return true
    if (_.get(resource, 'Properties.ApiId.Ref') === token) return true
    if (
      resource &&
      resource.DependsOn &&
      Array.isArray(resource.DependsOn) &&
      resource.DependsOn.includes(token)
    ) {
      return true
    }
    return false
  })
