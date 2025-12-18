export default async ({
  options,
  resolveVariable,
  resolveConfigurationProperty,
}) => {
  const value = await resolveConfigurationProperty(['custom', 'option1'])
  return {
    value,
  }
}
