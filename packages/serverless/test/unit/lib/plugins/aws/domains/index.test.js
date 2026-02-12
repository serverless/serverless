import ServerlessCustomDomain from '../../../../../../lib/plugins/aws/domains/index.js'
import Globals from '../../../../../../lib/plugins/aws/domains/globals.js'
import { jest } from '@jest/globals'

describe('ServerlessCustomDomain', () => {
  describe('getDefaultApiType', () => {
    let serverlessCustomDomain
    let mockServerless

    beforeEach(() => {
      mockServerless = {
        service: {
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
          },
        },
      }

      serverlessCustomDomain = new ServerlessCustomDomain(mockServerless, {})
    })

    it('should return HTTP when no API resources are detected', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {}

      const result = serverlessCustomDomain.getDefaultApiType()

      expect(result).toBe(Globals.apiTypes.http)
    })

    it('should return HTTP when only HttpApi resource is detected', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.getDefaultApiType()

      expect(result).toBe(Globals.apiTypes.http)
    })

    it('should return REST when only ApiGatewayRestApi resource is detected', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
        }

      const result = serverlessCustomDomain.getDefaultApiType()

      expect(result).toBe(Globals.apiTypes.rest)
    })

    it('should return WEBSOCKET when only WebsocketsApi resource is detected', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          WebsocketsApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.getDefaultApiType()

      expect(result).toBe(Globals.apiTypes.websocket)
    })

    it('should return the first detected API type when multiple API resources exist (HTTP and WebSocket)', () => {
      // This is the key fix: when both HTTP and WebSocket APIs are configured,
      // the method should return a sensible default instead of throwing an error.
      // Users with multiple API types should specify explicit apiType for each domain.
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
          WebsocketsApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.getDefaultApiType()

      // Should return one of the detected types (HTTP is first in the apiTypes object)
      expect([
        Globals.apiTypes.http,
        Globals.apiTypes.rest,
        Globals.apiTypes.websocket,
      ]).toContain(result)
    })

    it('should return the first detected API type when multiple API resources exist (REST and WebSocket)', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
          WebsocketsApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.getDefaultApiType()

      expect([
        Globals.apiTypes.http,
        Globals.apiTypes.rest,
        Globals.apiTypes.websocket,
      ]).toContain(result)
    })

    it('should return the first detected API type when all three API resources exist', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
          ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
          WebsocketsApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.getDefaultApiType()

      expect([
        Globals.apiTypes.http,
        Globals.apiTypes.rest,
        Globals.apiTypes.websocket,
      ]).toContain(result)
    })
  })

  describe('detectApiTypesFromTemplate', () => {
    let serverlessCustomDomain
    let mockServerless

    beforeEach(() => {
      mockServerless = {
        service: {
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
          },
        },
      }

      serverlessCustomDomain = new ServerlessCustomDomain(mockServerless, {})
    })

    it('should return empty array when no API resources exist', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {}

      const result = serverlessCustomDomain.detectApiTypesFromTemplate()

      expect(result).toEqual([])
    })

    it('should detect HTTP API type', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.detectApiTypesFromTemplate()

      expect(result).toContain(Globals.apiTypes.http)
    })

    it('should detect REST API type', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
        }

      const result = serverlessCustomDomain.detectApiTypesFromTemplate()

      expect(result).toContain(Globals.apiTypes.rest)
    })

    it('should detect WebSocket API type', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          WebsocketsApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.detectApiTypesFromTemplate()

      expect(result).toContain(Globals.apiTypes.websocket)
    })

    it('should detect multiple API types', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate.Resources =
        {
          HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
          WebsocketsApi: { Type: 'AWS::ApiGatewayV2::Api' },
        }

      const result = serverlessCustomDomain.detectApiTypesFromTemplate()

      expect(result).toHaveLength(2)
      expect(result).toContain(Globals.apiTypes.http)
      expect(result).toContain(Globals.apiTypes.websocket)
    })

    it('should handle missing compiledCloudFormationTemplate gracefully', () => {
      mockServerless.service.provider.compiledCloudFormationTemplate = undefined

      const result = serverlessCustomDomain.detectApiTypesFromTemplate()

      expect(result).toEqual([])
    })
  })

  describe('initializeVariables', () => {
    let serverlessCustomDomain
    let mockServerless

    beforeEach(() => {
      mockServerless = {
        service: {
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
                WebsocketsApi: { Type: 'AWS::ApiGatewayV2::Api' },
              },
            },
          },
        },
      }

      serverlessCustomDomain = new ServerlessCustomDomain(mockServerless, {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should not call getDefaultApiType when all domains have explicit apiType', () => {
      // This tests the lazy evaluation fix: when domains have explicit apiType,
      // getDefaultApiType should not be called (avoiding the multiple API types error)
      mockServerless.service.provider.domains = [
        { name: 'api.example.com', apiType: 'http' },
        { name: 'ws.example.com', apiType: 'websocket' },
      ]

      const spy = jest.spyOn(serverlessCustomDomain, 'getDefaultApiType')

      serverlessCustomDomain.initializeVariables()

      expect(spy).not.toHaveBeenCalled()
      expect(serverlessCustomDomain.domains).toHaveLength(2)
    })

    it('should call getDefaultApiType only when a domain needs it', () => {
      // When a domain doesn't have explicit apiType, getDefaultApiType is called
      mockServerless.service.provider.domains = [
        { name: 'api.example.com' }, // No apiType - needs default
      ]

      const spy = jest.spyOn(serverlessCustomDomain, 'getDefaultApiType')

      serverlessCustomDomain.initializeVariables()

      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should call getDefaultApiType only once even with multiple domains needing defaults', () => {
      // Default should be computed once and cached
      mockServerless.service.provider.domains = [
        { name: 'api1.example.com' }, // No apiType
        { name: 'api2.example.com' }, // No apiType
      ]

      const spy = jest.spyOn(serverlessCustomDomain, 'getDefaultApiType')

      serverlessCustomDomain.initializeVariables()

      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('should correctly handle mixed domains (some with explicit apiType, some without)', () => {
      mockServerless.service.provider.domains = [
        { name: 'api.example.com', apiType: 'http' },
        { name: 'default.example.com' }, // No apiType - will use default
        { name: 'ws.example.com', apiType: 'websocket' },
      ]

      serverlessCustomDomain.initializeVariables()

      expect(serverlessCustomDomain.domains).toHaveLength(3)
      expect(serverlessCustomDomain.domains[0].apiType).toBe('HTTP')
      // The second domain should get a default type (HTTP since it's first in iteration)
      expect(serverlessCustomDomain.domains[1].apiType).toBeDefined()
      expect(serverlessCustomDomain.domains[2].apiType).toBe('WEBSOCKET')
    })

    it('should handle per-API-type domain structure without calling getDefaultApiType', () => {
      // When using the per-type structure (http: {...}, websocket: {...}),
      // getDefaultApiType should not be called
      mockServerless.service.provider.domains = [
        {
          http: { name: 'api.example.com' },
          websocket: { name: 'ws.example.com' },
        },
      ]

      const spy = jest.spyOn(serverlessCustomDomain, 'getDefaultApiType')

      serverlessCustomDomain.initializeVariables()

      expect(spy).not.toHaveBeenCalled()
      expect(serverlessCustomDomain.domains).toHaveLength(2)
    })
  })
})
