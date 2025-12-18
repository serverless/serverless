export default async ({ resolveVariable }) => {
  const dbHost = await resolveVariable('env:DB_HOST')
  return { dbHost }
}
