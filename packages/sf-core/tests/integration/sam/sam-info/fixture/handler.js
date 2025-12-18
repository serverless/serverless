exports.handler = async (event) => {
  return {
    service: 'sam',
    tableName: process.env.TABLE_NAME,
    domain: process.env.DOMAIN,
  }
}
