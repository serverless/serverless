export default async ({
  options,
  resolveVariable,
  resolveConfigurationProperty,
}) => {
  const value = await resolveVariable('env:FOO')
  const stage = await resolveVariable('env:MISSING_ENV_VAR, sls:stage')
  const fallback = await resolveVariable(
    "env:MISSING_ENV_VAR, 'fallback-value'",
  )
  return {
    envVar: value,
    stage,
    fallback,
  }
}
