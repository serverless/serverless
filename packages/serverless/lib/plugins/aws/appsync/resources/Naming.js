export class Naming {
  constructor(apiName) {
    this.apiName = apiName
  }

  getCfnName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '')
  }

  getLogicalId(name) {
    return this.getCfnName(name)
  }

  getApiLogicalId() {
    return this.getLogicalId(`GraphQlApi`)
  }

  getSchemaLogicalId() {
    return this.getLogicalId(`GraphQlSchema`)
  }

  getDomainNameLogicalId() {
    return this.getLogicalId(`GraphQlDomainName`)
  }

  getDomainCertificateLogicalId() {
    return this.getLogicalId(`GraphQlDomainCertificate`)
  }

  getDomainAssociationLogicalId() {
    return this.getLogicalId(`GraphQlDomainAssociation`)
  }

  getDomainReoute53RecordLogicalId() {
    return this.getLogicalId(`GraphQlDomainRoute53Record`)
  }

  getLogGroupLogicalId() {
    return this.getLogicalId(`GraphQlApiLogGroup`)
  }

  getLogGroupRoleLogicalId() {
    return this.getLogicalId(`GraphQlApiLogGroupRole`)
  }

  getLogGroupPolicyLogicalId() {
    return this.getLogicalId(`GraphQlApiLogGroupPolicy`)
  }

  getCachingLogicalId() {
    return this.getLogicalId(`GraphQlCaching`)
  }

  getLambdaAuthLogicalId() {
    return this.getLogicalId(`LambdaAuthorizerPermission`)
  }

  getApiKeyLogicalId(name) {
    return this.getLogicalId(`GraphQlApi${name}`)
  }

  // Warning: breaking change.
  // api name added
  getDataSourceLogicalId(name) {
    return `GraphQlDs${this.getLogicalId(name)}`
  }

  getDataSourceRoleLogicalId(name) {
    return this.getDataSourceLogicalId(`${name}Role`)
  }

  getResolverLogicalId(type, field) {
    return this.getLogicalId(`GraphQlResolver${type}${field}`)
  }

  getPipelineFunctionLogicalId(name) {
    return this.getLogicalId(`GraphQlFunctionConfiguration${name}`)
  }

  getWafLogicalId() {
    return this.getLogicalId('GraphQlWaf')
  }

  getWafAssociationLogicalId() {
    return this.getLogicalId('GraphQlWafAssoc')
  }

  getDataSourceEmbeddedLambdaResolverName(config) {
    return config.name
  }

  getResolverEmbeddedSyncLambdaName(config) {
    if ('name' in config) {
      return `${config.name}_Sync`
    } else {
      return `${config.type}_${config.field}_Sync`
    }
  }

  getAuthenticationEmbeddedLamdbaName() {
    return `${this.apiName}Authorizer`
  }
}
