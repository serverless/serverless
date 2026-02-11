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
})
