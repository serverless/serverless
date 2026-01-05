import _ from 'lodash'
const { each } = _
import { Api } from '../../../../../../lib/plugins/aws/appsync/resources/Api.js'
import { Waf } from '../../../../../../lib/plugins/aws/appsync/resources/Waf.js'
import * as given from './given.js'

const plugin = given.plugin()

describe('Waf', () => {
  describe('Base Resources', () => {
    it('should generate waf Resources', () => {
      const api = new Api(given.appSyncConfig(), plugin)
      const waf = new Waf(api, {
        enabled: true,
        name: 'Waf',
        defaultAction: 'Allow',
        description: 'My Waf ACL',
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          name: 'MyVisibilityConfig',
          sampledRequestsEnabled: true,
        },
        rules: [],
      })
      expect(waf.compile()).toMatchSnapshot()
    })

    it('should generate waf Resources without tags', () => {
      const api = new Api(
        given.appSyncConfig({
          tags: undefined,
        }),
        plugin,
      )
      const waf = new Waf(api, {
        enabled: true,
        name: 'Waf',
        defaultAction: 'Allow',
        description: 'My Waf ACL',
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          name: 'MyVisibilityConfig',
          sampledRequestsEnabled: true,
        },
        rules: [],
      })
      expect(waf.compile()).toMatchSnapshot()
    })

    it('should not generate waf Resources if disabled', () => {
      const api = new Api(
        given.appSyncConfig({
          waf: {
            enabled: false,
            name: 'Waf',
            rules: [],
          },
        }),
        plugin,
      )
      expect(api.compileWafRules()).toEqual({})
    })

    it('should generate only the waf association', () => {
      const api = new Api(given.appSyncConfig(), plugin)
      const waf = new Waf(api, {
        enabled: true,
        arn: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-Waf/d7b694d2-4f7d-4dd6-a9a9-843dd1931330',
      })
      expect(waf.compile()).toMatchSnapshot()
    })
  })

  describe('Throttle rules', () => {
    const api = new Api(given.appSyncConfig(), plugin)
    const waf = new Waf(api, {
      name: 'Waf',
      rules: [],
    })

    it('should generate a preset rule', () => {
      expect(waf.buildWafRule('throttle', 'Base')).toMatchSnapshot()
    })

    it('should generate a preset rule with limit', () => {
      expect(waf.buildWafRule({ throttle: 500 }, 'Base')).toMatchSnapshot()
    })

    it('should generate a preset rule with config', () => {
      expect(
        waf.buildWafRule(
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

          'Base',
        ),
      ).toMatchSnapshot()
    })
  })

  describe('Disable introspection', () => {
    const api = new Api(given.appSyncConfig(), plugin)
    const waf = new Waf(api, {
      name: 'Waf',
      rules: [],
    })

    it('should generate a preset rule', () => {
      expect(waf.buildWafRule('disableIntrospection', 'Base')).toMatchSnapshot()
    })

    it('should generate a preset rule with custon config', () => {
      expect(
        waf.buildWafRule(
          {
            disableIntrospection: {
              priority: 200,
              visibilityConfig: {
                name: 'DisableIntrospection',
                sampledRequestsEnabled: false,
                cloudWatchMetricsEnabled: false,
              },
            },
          },
          'Base',
        ),
      ).toMatchSnapshot()
    })
  })

  describe('Custom rules', () => {
    const api = new Api(given.appSyncConfig(), plugin)
    const waf = new Waf(api, {
      name: 'Waf',
      rules: [],
    })

    it('should generate a custom rule', () => {
      expect(
        waf.buildWafRule(
          {
            name: 'disable US',
            priority: 200,
            action: 'Block',
            statement: {
              GeoMatchStatement: {
                CountryCodes: ['US'],
              },
            },
          },
          'Base',
        ),
      ).toMatchSnapshot()
    })

    it('should generate a custom rule with ManagedRuleGroup', () => {
      expect(
        waf.buildWafRule(
          {
            name: 'MyRule1',
            priority: 200,
            overrideAction: {
              None: {},
            },
            statement: {
              ManagedRuleGroupStatement: {
                Name: 'AWSManagedRulesCommonRuleSet',
                VendorName: 'AWS',
              },
            },
          },
          'Base',
        ),
      ).toMatchSnapshot()
    })
  })

  describe('ApiKey rules', () => {
    const configs = {
      throttle: 'throttle',
      disableIntrospection: 'disableIntrospection',
      customRule: {
        name: 'MyCustomRule',
        statement: {
          GeoMatchStatement: {
            CountryCodes: ['US'],
          },
        },
      },
      throttleWithStatements: {
        throttle: {
          name: 'Throttle rule with custom ScopeDownStatement',
          limit: 100,
          scopeDownStatement: {
            ByteMatchStatement: {
              FieldToMatch: {
                SingleHeader: { Name: 'X-Foo' },
              },
              PositionalConstraint: 'EXACTLY',
              SearchString: 'Bar',
              TextTransformations: [
                {
                  Type: 'LOWERCASE',
                  Priority: 0,
                },
              ],
            },
          },
        },
      },
      emptyStatements: {
        name: 'rulesWithoutStatements',
        statement: {},
      },
    }
    const api = new Api(given.appSyncConfig(), plugin)
    const waf = new Waf(api, {
      name: 'Waf',
      rules: [],
    })

    each(configs, (rule, name) => {
      it(`should generate a rule for ${name}`, () => {
        const apiConfig = {
          name: 'MyKey',
          wafRules: [rule],
        }
        expect(waf.buildApiKeyRules(apiConfig)).toMatchSnapshot()
      })
    })
  })
})
