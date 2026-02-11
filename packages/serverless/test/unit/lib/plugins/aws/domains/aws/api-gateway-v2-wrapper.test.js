import { jest } from '@jest/globals'
import APIGatewayV2Wrapper from '../../../../../../../lib/plugins/aws/domains/aws/api-gateway-v2-wrapper.js'
import Globals from '../../../../../../../lib/plugins/aws/domains/globals.js'

describe('APIGatewayV2Wrapper', () => {
  beforeEach(() => {
    Globals.serverless = {
      providers: {
        aws: {
          sdk: {
            config: {},
          },
        },
      },
      service: {
        provider: {
          stackTags: {},
          tags: {},
        },
      },
    }
  })

  it('updates securityPolicy when explicitly configured and drifted', async () => {
    const wrapper = new APIGatewayV2Wrapper()
    const sendMock = jest
      .spyOn(wrapper.apiGateway, 'send')
      .mockResolvedValue({ regionalDomainName: 'd.example.com' })

    await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      hasSecurityPolicyConfigured: true,
      certificateArn: 'arn:configured',
      securityPolicy: 'TLS_1_2',
      domainInfo: {
        certificateArn: 'arn:live',
        securityPolicy: 'TLS_1_0',
      },
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input).toEqual({
      DomainName: 'api.example.com',
      DomainNameConfigurations: [
        {
          CertificateArn: 'arn:configured',
          SecurityPolicy: 'TLS_1_2',
        },
      ],
    })
  })

  it('falls back to live domain certificateArn when config value is not provided', async () => {
    const wrapper = new APIGatewayV2Wrapper()
    const sendMock = jest
      .spyOn(wrapper.apiGateway, 'send')
      .mockResolvedValue({ regionalDomainName: 'd.example.com' })

    await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      hasSecurityPolicyConfigured: true,
      securityPolicy: 'TLS_1_2',
      domainInfo: {
        certificateArn: 'arn:live',
        securityPolicy: 'TLS_1_0',
      },
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input).toEqual({
      DomainName: 'api.example.com',
      DomainNameConfigurations: [
        {
          CertificateArn: 'arn:live',
          SecurityPolicy: 'TLS_1_2',
        },
      ],
    })
  })

  it('throws when certificateArn cannot be resolved for update', async () => {
    const wrapper = new APIGatewayV2Wrapper()
    const sendMock = jest.spyOn(wrapper.apiGateway, 'send')

    await expect(
      wrapper.updateCustomDomain({
        givenDomainName: 'api.example.com',
        hasSecurityPolicyConfigured: true,
        securityPolicy: 'TLS_1_2',
        domainInfo: {
          securityPolicy: 'TLS_1_0',
        },
      }),
    ).rejects.toThrow(/Certificate ARN is required/)

    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does not call update when securityPolicy is not explicitly configured', async () => {
    const wrapper = new APIGatewayV2Wrapper()
    const sendMock = jest.spyOn(wrapper.apiGateway, 'send')

    const result = await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      hasSecurityPolicyConfigured: false,
      securityPolicy: 'TLS_1_2',
      domainInfo: {
        securityPolicy: 'TLS_1_0',
      },
    })

    expect(result).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does not call update when explicit securityPolicy has no drift', async () => {
    const wrapper = new APIGatewayV2Wrapper()
    const sendMock = jest.spyOn(wrapper.apiGateway, 'send')

    const result = await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      hasSecurityPolicyConfigured: true,
      securityPolicy: 'TLS_1_2',
      domainInfo: {
        securityPolicy: 'TLS_1_2',
      },
    })

    expect(result).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
