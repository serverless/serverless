import { jest } from '@jest/globals'
import ServerlessCustomDomain from '../../../../../../lib/plugins/aws/domains/index.js'

const createMockServerless = () => ({
  service: {
    provider: {
      compiledCloudFormationTemplate: {
        Resources: {
          HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
          ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
        },
      },
      domains: [],
    },
  },
})

describe('ServerlessCustomDomain', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('does not evaluate default API type when all domains specify apiType', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.domains = [
      { name: 'http.api.example.com', apiType: 'http' },
      { name: 'rest.api.example.com', apiType: 'rest' },
    ]

    const plugin = new ServerlessCustomDomain(mockServerless, {})
    const getDefaultApiTypeSpy = jest.spyOn(plugin, 'getDefaultApiType')

    plugin.initializeVariables()

    expect(getDefaultApiTypeSpy).not.toHaveBeenCalled()
    expect(plugin.domains).toHaveLength(2)
  })

  it('throws when apiType must be auto-detected with multiple API types present', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.domains = [{ name: 'api.example.com' }]

    const plugin = new ServerlessCustomDomain(mockServerless, {})

    expect(() => plugin.initializeVariables()).toThrow(
      /Multiple API types detected in CloudFormation template/,
    )
  })

  it('evaluates default API type once for multiple implicit domains', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.compiledCloudFormationTemplate.Resources = {
      HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
    }
    mockServerless.service.provider.domains = [
      { name: 'api-one.example.com' },
      { name: 'api-two.example.com' },
    ]

    const plugin = new ServerlessCustomDomain(mockServerless, {})
    const getDefaultApiTypeSpy = jest.spyOn(plugin, 'getDefaultApiType')

    plugin.initializeVariables()

    expect(getDefaultApiTypeSpy).toHaveBeenCalledTimes(1)
    expect(plugin.domains).toHaveLength(2)
  })

  it('throws when accessMode is configured for HTTP domains (v2-managed)', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.domains = [
      {
        name: 'http.api.example.com',
        apiType: 'http',
        accessMode: 'strict',
      },
    ]

    const plugin = new ServerlessCustomDomain(mockServerless, {})
    plugin.initializeVariables()

    expect(() => plugin.validateDomainConfigs()).toThrow(
      /only supported for REST domains managed by API Gateway V1/,
    )
  })

  it('throws when accessMode is configured for REST domains with multi-level basePath', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.domains = [
      {
        name: 'rest.api.example.com',
        apiType: 'rest',
        basePath: 'v1/test',
        accessMode: 'BASIC',
      },
    ]

    const plugin = new ServerlessCustomDomain(mockServerless, {})
    plugin.initializeVariables()

    expect(() => plugin.validateDomainConfigs()).toThrow(
      /the 'basePath' uses multiple segments/,
    )
  })

  it('does not throw when accessMode is configured for REST with single-level basePath', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.domains = [
      {
        name: 'rest.api.example.com',
        apiType: 'rest',
        basePath: 'v1',
        accessMode: 'STRICT',
      },
    ]

    const plugin = new ServerlessCustomDomain(mockServerless, {})
    plugin.initializeVariables()

    expect(() => plugin.validateDomainConfigs()).not.toThrow()
  })

  it('throws when enhanced securityPolicy is configured for v2 domains', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.domains = [
      {
        name: 'http.api.example.com',
        apiType: 'http',
        securityPolicy: 'SecurityPolicy_TLS13_2025_EDGE',
      },
    ]

    const plugin = new ServerlessCustomDomain(mockServerless, {})
    plugin.initializeVariables()

    expect(() => plugin.validateDomainConfigs()).toThrow(
      /not supported for API Gateway V2 domains/,
    )
  })

  it('does not throw when TLS_1_2 is configured for v2 domains', () => {
    const mockServerless = createMockServerless()
    mockServerless.service.provider.domains = [
      {
        name: 'http.api.example.com',
        apiType: 'http',
        securityPolicy: 'TLS_1_2',
      },
    ]

    const plugin = new ServerlessCustomDomain(mockServerless, {})
    plugin.initializeVariables()

    expect(() => plugin.validateDomainConfigs()).not.toThrow()
  })
})
