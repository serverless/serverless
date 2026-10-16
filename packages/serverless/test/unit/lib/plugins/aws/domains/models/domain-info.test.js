import DomainInfo from '../../../../../../../lib/plugins/aws/domains/models/domain-info.js'

describe('DomainInfo', () => {
  it('maps endpointAccessMode from v1 domain responses', () => {
    const domainInfo = new DomainInfo({
      regionalDomainName: 'd.example.com',
      endpointAccessMode: 'STRICT',
    })

    expect(domainInfo.accessMode).toBe('STRICT')
  })

  it('keeps accessMode undefined when endpointAccessMode is missing', () => {
    const domainInfo = new DomainInfo({
      regionalDomainName: 'd.example.com',
    })

    expect(domainInfo.accessMode).toBeUndefined()
  })

  it('maps certificateArn from v2 domain responses', () => {
    const domainInfo = new DomainInfo({
      DomainNameConfigurations: [
        {
          CertificateArn: 'arn:aws:acm:us-east-1:123:certificate/abc',
        },
      ],
    })

    expect(domainInfo.certificateArn).toBe(
      'arn:aws:acm:us-east-1:123:certificate/abc',
    )
  })

  it('maps ipAddressType from v1 domain responses', () => {
    const domainInfo = new DomainInfo({
      regionalDomainName: 'd.example.com',
      endpointConfiguration: {
        types: ['REGIONAL'],
        ipAddressType: 'dualstack',
      },
    })

    expect(domainInfo.ipAddressType).toBe('dualstack')
  })

  it('maps ipAddressType from v2 domain responses', () => {
    const domainInfo = new DomainInfo({
      DomainNameConfigurations: [
        {
          ApiGatewayDomainName: 'd.example.com',
          IpAddressType: 'dualstack',
        },
      ],
    })

    expect(domainInfo.ipAddressType).toBe('dualstack')
  })

  it('keeps ipAddressType undefined when missing from response', () => {
    const domainInfo = new DomainInfo({
      regionalDomainName: 'd.example.com',
    })

    expect(domainInfo.ipAddressType).toBeUndefined()
  })

  it('keeps certificateArn undefined when missing from response', () => {
    const domainInfo = new DomainInfo({
      regionalDomainName: 'd.example.com',
    })

    expect(domainInfo.certificateArn).toBeUndefined()
  })
})
