/**
 * Wrapper class for Custom Domain information
 */
class DomainInfo {
  /**
   * Sometimes, the getDomainName call doesn't return either a distributionHostedZoneId or a regionalHostedZoneId.
   * AFAICT, this only happens with edge-optimized endpoints.
   * The hostedZoneId for these endpoints is always the one below.
   * Docs: https://docs.aws.amazon.com/general/latest/gr/rande.html#apigateway_region
   * PR: https://github.com/amplify-education/serverless-domain-manager/pull/171
   */
  defaultHostedZoneId = 'Z2FDTNDATAQYW2'
  defaultSecurityPolicy = 'TLS_1_2'

  constructor(data) {
    this.domainName =
      data.distributionDomainName ||
      data.regionalDomainName ||
      (data.DomainNameConfigurations &&
        data.DomainNameConfigurations[0].ApiGatewayDomainName) ||
      data.DomainName ||
      data.domainName

    this.hostedZoneId =
      data.distributionHostedZoneId ||
      data.regionalHostedZoneId ||
      (data.DomainNameConfigurations &&
        data.DomainNameConfigurations[0].HostedZoneId) ||
      this.defaultHostedZoneId

    this.securityPolicy =
      data.securityPolicy ||
      (data.DomainNameConfigurations &&
        data.DomainNameConfigurations[0].SecurityPolicy) ||
      this.defaultSecurityPolicy

    this.certificateArn =
      data.certificateArn ||
      (data.DomainNameConfigurations &&
        data.DomainNameConfigurations[0].CertificateArn)

    this.accessMode = data.endpointAccessMode
  }
}

export default DomainInfo
