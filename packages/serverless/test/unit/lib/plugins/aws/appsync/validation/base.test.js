import { validateConfig } from '../../../../../../../lib/plugins/aws/appsync/validation.js'
import { basicConfig } from '../basicConfig.js'

describe('Validation', () => {
  it('should validate', () => {
    expect(
      validateConfig({
        ...basicConfig,
        visibility: 'GLOBAL',
        introspection: true,
        queryDepthLimit: 10,
        resolverCountLimit: 10,
        xrayEnabled: true,
        environment: {
          MY_TABLE: 'my-table',
          MY_OTHER_TABLE: { Ref: 'MyOtherTable' },
        },
        tags: {
          foo: 'bar',
        },
        esbuild: {
          target: 'es2020',
          sourcemap: false,
          treeShaking: false,
        },
      }),
    ).toBe(true)

    expect(function () {
      validateConfig({
        visibility: 'FOO',
        introspection: 10,
        queryDepthLimit: 'foo',
        resolverCountLimit: 'bar',
        xrayEnabled: 'BAR',
        unknownPorp: 'foo',
        esbuild: 'bad',
        environment: 'Bad',
      })
    }).toThrowErrorMatchingSnapshot()

    expect(function () {
      validateConfig({
        ...basicConfig,
        queryDepthLimit: 76,
        resolverCountLimit: 1001,
      })
    }).toThrowErrorMatchingSnapshot()
  })

  describe('Log', () => {
    describe('Valid', () => {
      const assertions = [
        {
          name: 'Minimum',
          config: {
            ...basicConfig,
            logging: {
              level: 'ALL',
            },
          },
        },
        {
          name: 'Full',
          config: {
            ...basicConfig,
            logging: {
              level: 'ALL',
              retentionInDays: 14,
              excludeVerboseContent: true,
              loggingRoleArn: { Ref: 'MyLogGorupArn' },
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(validateConfig(config.config)).toBe(true)
        })
      })
    })

    describe('Invalid', () => {
      const assertions = [
        {
          name: 'Invalid',
          config: {
            ...basicConfig,
            logging: {
              level: 'FOO',
              retentionInDays: 'bar',
              excludeVerboseContent: 'buzz',
              loggingRoleArn: 123,
              visibility: 'FOO',
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(function () {
            validateConfig(config.config)
          }).toThrowErrorMatchingSnapshot()
        })
      })
    })
  })

  describe('Waf', () => {
    describe('Valid', () => {
      const assertions = [
        {
          name: 'Minimum',
          config: {
            ...basicConfig,
            waf: {
              rules: [],
            },
          },
        },
        {
          name: 'Full',
          config: {
            ...basicConfig,
            waf: {
              enabled: true,
              name: 'MyWaf',
              defaultAction: 'Allow',
              description: 'My Waf rules',
              visibilityConfig: {
                name: 'myRule',
                cloudWatchMetricsEnabled: true,
                sampledRequestsEnabled: true,
              },
              rules: [
                'throttle',
                { throttle: 100 },
                {
                  throttle: {
                    name: 'Throttle',
                    action: 'Block',
                    limit: 200,
                    priority: 200,
                    aggregateKeyType: 'IP',
                    forwardedIPConfig: {
                      headerName: 'X-Forwarded-For',
                      fallbackBehavior: 'MATCH',
                    },
                    visibilityConfig: {
                      name: 'throttle200',
                      cloudWatchMetricsEnabled: true,
                      sampledRequestsEnabled: true,
                    },
                  },
                },
                'disableIntrospection',
                {
                  disableIntrospection: {
                    name: 'Disable Intorspection',
                    priority: 100,
                    visibilityConfig: {
                      name: 'DisableIntrospection',
                      cloudWatchMetricsEnabled: true,
                      sampledRequestsEnabled: true,
                    },
                  },
                },
                {
                  name: 'Custom Rule',
                  action: 'Count',
                  priority: 500,
                  statement: {
                    NotStatement: {
                      Statement: {
                        GeoMatchStatement: {
                          CountryCodes: ['US'],
                        },
                      },
                    },
                  },
                  visibilityConfig: {
                    name: 'myRule',
                    cloudWatchMetricsEnabled: true,
                    sampledRequestsEnabled: true,
                  },
                },
              ],
            },
          },
        },
        {
          name: 'Using arn',
          config: {
            ...basicConfig,
            waf: {
              enabled: true,
              arn: 'arn:aws:',
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(validateConfig(config.config)).toBe(true)
        })
      })
    })

    describe('Invalid', () => {
      const assertions = [
        {
          name: 'Invalid',
          config: {
            ...basicConfig,
            waf: {
              enabled: 'foo',
              name: 123,
              defaultAction: 'Buzz',
              visibilityConfig: {
                name: 123,
                cloudWatchMetricsEnabled: 456,
                sampledRequestsEnabled: 789,
              },
              rules: [
                'fake',
                { invalid: 100 },
                {
                  name: 123,
                  statement: 456,
                },
              ],
            },
          },
        },
        {
          name: 'Invalid arn',
          config: {
            ...basicConfig,
            waf: {
              arn: 123,
            },
          },
        },
        {
          name: 'Throttle limit',
          config: {
            ...basicConfig,
            waf: {
              rules: [
                { throttle: 99 },
                {
                  throttle: {
                    name: 'Throttle',
                    limit: 99,
                  },
                },
              ],
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(function () {
            validateConfig(config.config)
          }).toThrowErrorMatchingSnapshot()
        })
      })
    })
  })

  describe('Domain', () => {
    describe('Valid', () => {
      const assertions = [
        {
          name: 'Minimum',
          config: {
            ...basicConfig,
            domain: {
              name: 'api.example.com',
              certificateArn: 'arn:aws:',
            },
          },
        },
        {
          name: 'Full',
          config: {
            ...basicConfig,
            domain: {
              enabled: true,
              certificateArn: 'arn:aws:',
              name: 'api.example.com',
              hostedZoneId: 'Z111111QQQQQQQ',
              hostedZoneName: 'example.com.',
              route53: true,
            },
          },
        },
        {
          name: 'useCloudFormation: false, missing certificateArn',
          config: {
            ...basicConfig,
            domain: {
              name: 'api.example.com',
              useCloudFormation: false,
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(validateConfig(config.config)).toBe(true)
        })
      })
    })

    describe('Invalid', () => {
      const assertions = [
        {
          name: 'Invalid',
          config: {
            ...basicConfig,
            domain: {
              enabled: 'foo',
              name: 'bar',
              certificateArn: 123,
              route53: 123,
            },
          },
        },
        {
          name: 'useCloudFormation: true, certificateArn or hostedZoneId is required',
          config: {
            ...basicConfig,
            domain: {
              name: 'api.example.com',
              useCloudFormation: true,
            },
          },
        },
        {
          name: 'useCloudFormation: not present, certificateArn or hostedZoneId is required',
          config: {
            ...basicConfig,
            domain: {
              name: 'api.example.com',
            },
          },
        },
        {
          name: 'Invalid Route 53',
          config: {
            ...basicConfig,
            domain: {
              name: 'bar',
              certificateArn: 'arn:aws:',
              route53: {
                hostedZoneId: 456,
                hostedZoneName: 789,
              },
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(function () {
            validateConfig(config.config)
          }).toThrowErrorMatchingSnapshot()
        })
      })
    })
  })

  describe('Caching', () => {
    describe('Valid', () => {
      const assertions = [
        {
          name: 'Minimum',
          config: {
            ...basicConfig,
            caching: {
              behavior: 'PER_RESOLVER_CACHING',
            },
          },
        },
        {
          name: 'Full',
          config: {
            ...basicConfig,
            caching: {
              enabled: true,
              behavior: 'PER_RESOLVER_CACHING',
              type: 'SMALL',
              ttl: 3600,
              atRestEncryption: true,
              transitEncryption: true,
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(validateConfig(config.config)).toBe(true)
        })
      })
    })

    describe('Invalid', () => {
      const assertions = [
        {
          name: 'Invalid',
          config: {
            ...basicConfig,
            caching: {
              enabled: 'foo',
              behavior: 'bar',
              type: 'INVALID',
              ttl: 'bizz',
              atRestEncryption: 'bizz',
              transitEncryption: 'bazz',
            },
          },
        },
        {
          name: 'Ttl min value',
          config: {
            ...basicConfig,
            caching: {
              behavior: 'PER_RESOLVER_CACHING',
              ttl: 0,
            },
          },
        },
        {
          name: 'Ttl max value',
          config: {
            ...basicConfig,
            caching: {
              behavior: 'PER_RESOLVER_CACHING',
              ttl: 3601,
            },
          },
        },
      ]

      assertions.forEach((config) => {
        it(`should validate a ${config.name}`, () => {
          expect(function () {
            validateConfig(config.config)
          }).toThrowErrorMatchingSnapshot()
        })
      })
    })
  })
})
