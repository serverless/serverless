exports.testResolution = async ({
  resolveConfigurationProperty,
  resolveVariable,
}) => {
  const value = await resolveConfigurationProperty(['custom', 'option1'])
  let resolvedVariable = await resolveVariable('self:custom.test1')
  let fileDataWithSsmReference = await resolveVariable('file(data.yml)')
  let instanceId = await resolveVariable('sls:instanceId')
  return {
    value,
    resolvedVariable,
    instanceId,
    fileDataWithSsmReference,
  }
}
