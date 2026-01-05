function getServerlessStackName(provider) {
  return provider.naming.getStackName()
}

function getValue(provider, value, name) {
  if (typeof value === 'string') {
    return Promise.resolve(value)
  } else if (value && typeof value.Ref === 'string') {
    return provider
      .request('CloudFormation', 'listStackResources', {
        StackName: getServerlessStackName(provider),
      })
      .then((result) => {
        const resource = result.StackResourceSummaries.find(
          (r) => r.LogicalResourceId === value.Ref,
        )
        if (!resource) {
          throw new Error(`${name}: Ref "${value.Ref} not found`)
        }

        return resource.PhysicalResourceId
      })
  }

  return Promise.reject(new Error(`${value} is not a valid ${name}`))
}

export { getServerlessStackName, getValue }
