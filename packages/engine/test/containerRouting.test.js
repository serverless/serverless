import { z } from 'zod'
import { ConfigContainerRouting, ConfigContainerSchema } from '../src/types.js'

describe('Container Routing Configuration Schema Validation', () => {
  describe('ConfigContainerRouting', () => {
    test('should accept valid routing configuration', () => {
      const validConfigs = [
        {
          domain: 'api.example.com',
          pathPattern: '/api/v1/*',
          pathHealthCheck: '/health',
        },
        {
          pathPattern: '/images/*',
        },
        {
          domain: 'static.example.com',
          pathPattern: '/assets/images/logo.png',
        },
      ]
      validConfigs.forEach((config) => {
        expect(() => ConfigContainerRouting.parse(config)).not.toThrow()
      })
    })

    test('should accept any string as domain', () => {
      const domains = [
        'api.example.com',
        'test.domain.com',
        'my-api.domain.com',
      ]

      domains.forEach((domain) => {
        const result = ConfigContainerRouting.safeParse({
          domain,
          pathPattern: '/api/*',
        })
        expect(result.success).toBe(true)
      })
    })

    test('should validate pathPattern format', () => {
      const invalidPathPatterns = [
        'no-leading-slash', // must start with /
        '/path with spaces', // no spaces allowed
        '/path<invalid>', // no < > allowed
        '/path"quotes"', // no quotes allowed
        '/path\\backslash', // no backslashes allowed
        'http://example.com/path', // should not include protocol/domain
      ]

      invalidPathPatterns.forEach((pathPattern) => {
        const result = ConfigContainerRouting.safeParse({
          pathPattern,
        })
        expect(result.success).toBe(false)
        expect(result.error.errors[0].message).toBe(
          'Must start with "/" and cannot contain spaces or invalid characters (<, >, \\, ").',
        )
      })
    })

    test('should accept valid path patterns with wildcards', () => {
      const validPathPatterns = [
        '/api/users/*', // prefix match
        '/assets/*/images/*', // multi-level wildcard
        '/profile/202?', // single character wildcard
        '/static/exact/match.png', // exact match
        '/api/v1/users/*/posts/*', // multiple wildcards
      ]

      validPathPatterns.forEach((pathPattern) => {
        expect(() =>
          ConfigContainerRouting.parse({
            pathPattern,
          }),
        ).not.toThrow()
      })
    })

    test('should validate pathHealthCheck format', () => {
      const validConfig = {
        pathPattern: '/api/*',
        pathHealthCheck: '/health',
      }
      expect(() => ConfigContainerRouting.parse(validConfig)).not.toThrow()

      // pathHealthCheck is optional
      const configWithoutHealthCheck = {
        pathPattern: '/api/*',
      }
      expect(() =>
        ConfigContainerRouting.parse(configWithoutHealthCheck),
      ).not.toThrow()
    })

    test('should reject unknown properties', () => {
      const configWithUnknownProp = {
        pathPattern: '/api/*',
        unknownProp: 'value',
      }
      expect(() => ConfigContainerRouting.parse(configWithUnknownProp)).toThrow(
        /Unrecognized key/,
      )
    })

    test('should require pathPattern', () => {
      const configWithoutPathPattern = {
        domain: 'api.example.com',
      }
      expect(() =>
        ConfigContainerRouting.parse(configWithoutPathPattern),
      ).toThrow(/Required/)
    })
  })

  describe('Container Schema with Routing', () => {
    test('should validate routing within container configuration', () => {
      const validConfig = {
        src: './app',
        compute: {
          type: 'awsLambda',
        },
        routing: {
          domain: 'api.example.com',
          pathPattern: '/api/*',
          pathHealthCheck: '/health',
        },
      }
      expect(() => ConfigContainerSchema.parse(validConfig)).not.toThrow()
    })

    test('should require routing configuration', () => {
      const configWithoutRouting = {
        src: './app',
        compute: {
          type: 'awsLambda',
        },
      }
      expect(() => ConfigContainerSchema.parse(configWithoutRouting)).toThrow(
        /Required/,
      )
    })

    test('should validate ALB routing with Fargate ECS', () => {
      const validConfig = {
        src: './app',
        compute: {
          type: 'awsFargateEcs',
          awsFargateEcs: {
            cpu: 256,
            memory: 512,
          },
        },
        routing: {
          domain: 'api.example.com',
          pathPattern: '/api/*',
          pathHealthCheck: '/health', // Required for ALB health checks
        },
      }
      expect(() => ConfigContainerSchema.parse(validConfig)).not.toThrow()
    })

    test('should validate ALB routing with Lambda', () => {
      const validConfig = {
        src: './app',
        compute: {
          type: 'awsLambda',
          awsLambda: {
            memory: 1024,
            vpc: true, // Enable VPC support
          },
        },
        routing: {
          domain: 'api.example.com',
          pathPattern: '/api/*',
        },
      }
      expect(() => ConfigContainerSchema.parse(validConfig)).not.toThrow()
    })

    test('should validate VPC networking configuration', () => {
      const validConfigs = [
        // Lambda with VPC
        {
          src: './app',
          compute: {
            type: 'awsLambda',
            awsLambda: {
              memory: 1024,
              vpc: true,
            },
          },
          routing: {
            pathPattern: '/api/*',
          },
        },
        // Fargate ECS (always uses VPC)
        {
          src: './app',
          compute: {
            type: 'awsFargateEcs',
            awsFargateEcs: {
              cpu: 256,
              memory: 512,
            },
          },
          routing: {
            pathPattern: '/api/*',
            pathHealthCheck: '/health',
          },
        },
      ]

      validConfigs.forEach((config) => {
        expect(() => ConfigContainerSchema.parse(config)).not.toThrow()
      })
    })
  })
})
