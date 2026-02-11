import { jest } from '@jest/globals'
import APIGatewayV1Wrapper from '../../../../../../../lib/plugins/aws/domains/aws/api-gateway-v1-wrapper.js'
import Globals from '../../../../../../../lib/plugins/aws/domains/globals.js'

describe('APIGatewayV1Wrapper', () => {
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

  it('includes endpointAccessMode when accessMode is provided', async () => {
    const wrapper = new APIGatewayV1Wrapper()
    const sendMock = jest
      .spyOn(wrapper.apiGateway, 'send')
      .mockResolvedValue({ regionalDomainName: 'd.example.com' })

    await wrapper.createCustomDomain({
      givenDomainName: 'api.example.com',
      endpointType: Globals.endpointTypes.regional,
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      securityPolicy: 'TLS_1_2',
      accessMode: 'STRICT',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input.endpointAccessMode).toBe('STRICT')
  })

  it('does not include endpointAccessMode when accessMode is not provided', async () => {
    const wrapper = new APIGatewayV1Wrapper()
    const sendMock = jest
      .spyOn(wrapper.apiGateway, 'send')
      .mockResolvedValue({ regionalDomainName: 'd.example.com' })

    await wrapper.createCustomDomain({
      givenDomainName: 'api.example.com',
      endpointType: Globals.endpointTypes.regional,
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      securityPolicy: 'TLS_1_2',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input.endpointAccessMode).toBeUndefined()
  })

  it('updates both securityPolicy and accessMode when they drift and are explicitly configured', async () => {
    const wrapper = new APIGatewayV1Wrapper()
    const sendMock = jest
      .spyOn(wrapper.apiGateway, 'send')
      .mockResolvedValue({ regionalDomainName: 'd.example.com' })

    await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      domainInfo: {
        securityPolicy: 'TLS_1_0',
        accessMode: 'BASIC',
      },
      hasSecurityPolicyConfigured: true,
      hasAccessModeConfigured: true,
      securityPolicy: 'TLS_1_2',
      accessMode: 'STRICT',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input.patchOperations).toEqual([
      {
        op: 'replace',
        path: '/securityPolicy',
        value: 'TLS_1_2',
      },
      {
        op: 'replace',
        path: '/endpointAccessMode',
        value: 'STRICT',
      },
    ])
  })

  it('updates only securityPolicy when accessMode is not explicitly configured', async () => {
    const wrapper = new APIGatewayV1Wrapper()
    const sendMock = jest
      .spyOn(wrapper.apiGateway, 'send')
      .mockResolvedValue({ regionalDomainName: 'd.example.com' })

    await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      domainInfo: {
        securityPolicy: 'TLS_1_0',
        accessMode: 'BASIC',
      },
      hasSecurityPolicyConfigured: true,
      hasAccessModeConfigured: false,
      securityPolicy: 'TLS_1_2',
      accessMode: 'STRICT',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input.patchOperations).toEqual([
      {
        op: 'replace',
        path: '/securityPolicy',
        value: 'TLS_1_2',
      },
    ])
  })

  it('updates only endpointAccessMode when explicit accessMode unset is requested', async () => {
    const wrapper = new APIGatewayV1Wrapper()
    const sendMock = jest
      .spyOn(wrapper.apiGateway, 'send')
      .mockResolvedValue({ regionalDomainName: 'd.example.com' })

    await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      domainInfo: {
        securityPolicy: 'TLS_1_2',
        accessMode: 'BASIC',
      },
      hasSecurityPolicyConfigured: true,
      hasAccessModeConfigured: true,
      securityPolicy: 'TLS_1_2',
      accessMode: undefined,
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input.patchOperations).toEqual([
      {
        op: 'replace',
        path: '/endpointAccessMode',
        value: undefined,
      },
    ])
  })

  it('does not call update when no explicit field has drift', async () => {
    const wrapper = new APIGatewayV1Wrapper()
    const sendMock = jest.spyOn(wrapper.apiGateway, 'send')

    const result = await wrapper.updateCustomDomain({
      givenDomainName: 'api.example.com',
      domainInfo: {
        securityPolicy: 'TLS_1_2',
        accessMode: 'STRICT',
      },
      hasSecurityPolicyConfigured: true,
      hasAccessModeConfigured: true,
      securityPolicy: 'TLS_1_2',
      accessMode: 'STRICT',
    })

    expect(result).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
