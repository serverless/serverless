import { validateConfig } from '../../../../../../../lib/plugins/aws/appsync/validation.js'
import { basicConfig } from '../basicConfig.js'

describe('Basic', () => {
  describe('Valid', () => {
    const assertions = [
      {
        name: 'Valid config',
        config: {
          apiKeys: [
            {
              name: 'John',
              description: "John's key",
              expiresAt: '2021-03-09T16:00:00+00:00',
              wafRuels: [
                {
                  throttle: {
                    priority: 300,
                    limit: 200,
                    aggregateKeyType: 'FORWARDED_IP',
                    forwardedIPConfig: {
                      headerName: 'X-Forwarded-To',
                      fallbackBehavior: 'MATCH',
                    },
                    visibilityConfig: {
                      name: 'ThrottleRule',
                      cloudWatchMetricsEnabled: false,
                      sampledRequestsEnabled: false,
                    },
                  },
                },
              ],
            },
            {
              name: 'Jane',
              expiresAfter: '1y',
            },
            {
              name: 'AfterHoursNumber',
              expiresAfter: 48,
            },
            {
              name: 'AfterHoursString',
              expiresAfter: '48',
            },
            {
              name: 'Name only',
            },
            'InlineKey',
          ],
        },
      },
    ]

    assertions.forEach((config) => {
      it(`should validate a ${config.name}`, () => {
        expect(validateConfig({ ...basicConfig, ...config.config })).toBe(true)
      })
    })
  })

  describe('Invalid', () => {
    const assertions = [
      {
        name: 'Missing name',
        config: {
          apiKeys: [
            {
              description: "John's key",
              expiresAfter: 100,
            },
          ],
        },
      },
      {
        name: 'Invalid expiresAt',
        config: {
          apiKeys: [
            {
              name: 'Default',
              expiresAt: 'invalid-date',
            },
          ],
        },
      },
      {
        name: 'Invalid duration',
        config: {
          apiKeys: [
            {
              name: 'Default',
              expiresAfter: 'invalid-duration',
            },
          ],
        },
      },
      {
        name: 'Invalid WAF rules',
        config: {
          apiKeys: [
            {
              name: 'Default',
              wafRules: [
                {
                  invalid: {
                    foo: 'bar',
                  },
                },
              ],
            },
          ],
        },
      },
    ]

    assertions.forEach((config) => {
      it(`should validate: ${config.name}`, () => {
        expect(function () {
          validateConfig({
            ...basicConfig,
            ...config.config,
          })
        }).toThrowErrorMatchingSnapshot()
      })
    })
  })
})
