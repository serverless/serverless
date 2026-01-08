import _ from 'lodash'
const { isEmpty, reduce } = _
import { toCfnKeys } from '../utils.js'

export class Waf {
  constructor(api, config) {
    this.api = api
    this.config = config
  }

  compile() {
    const wafConfig = this.config
    if (wafConfig.enabled === false) {
      return {}
    }
    const apiLogicalId = this.api.naming.getApiLogicalId()
    const wafAssocLogicalId = this.api.naming.getWafAssociationLogicalId()

    if (wafConfig.arn) {
      return {
        [wafAssocLogicalId]: {
          Type: 'AWS::WAFv2::WebACLAssociation',
          Properties: {
            ResourceArn: { 'Fn::GetAtt': [apiLogicalId, 'Arn'] },
            WebACLArn: wafConfig.arn,
          },
        },
      }
    }

    const name = wafConfig.name || `${this.api.config.name}Waf`
    const wafLogicalId = this.api.naming.getWafLogicalId()
    const defaultActionSource = wafConfig.defaultAction || 'Allow'
    const defaultAction =
      typeof defaultActionSource === 'string'
        ? { [defaultActionSource]: {} }
        : defaultActionSource

    return {
      [wafLogicalId]: {
        Type: 'AWS::WAFv2::WebACL',
        Properties: {
          DefaultAction: defaultAction,
          Scope: 'REGIONAL',
          Description:
            wafConfig.description ||
            `ACL rules for AppSync ${this.api.config.name}`,
          Name: name,
          Rules: this.buildWafRules(),
          VisibilityConfig: this.getWafVisibilityConfig(
            this.config.visibilityConfig,
            name,
          ),
          Tags: this.api.getTagsConfig(),
        },
      },
      [wafAssocLogicalId]: {
        Type: 'AWS::WAFv2::WebACLAssociation',
        Properties: {
          ResourceArn: { 'Fn::GetAtt': [apiLogicalId, 'Arn'] },
          WebACLArn: { 'Fn::GetAtt': [wafLogicalId, 'Arn'] },
        },
      },
    }
  }

  buildWafRules() {
    const rules = this.config.rules || []

    let defaultPriority = 100
    return rules
      .map((rule) => this.buildWafRule(rule))
      .concat(this.buildApiKeysWafRules())
      .map((rule) => ({
        ...rule,
        Priority: rule.Priority || defaultPriority++,
      }))
  }

  buildWafRule(rule, defaultNamePrefix) {
    // Throttle pre-set rule
    if (rule === 'throttle') {
      return this.buildThrottleRule({}, defaultNamePrefix)
    } else if (typeof rule === 'object' && 'throttle' in rule) {
      return this.buildThrottleRule(rule.throttle, defaultNamePrefix)
    }

    // Disable Introspection pre-set rule
    if (rule === 'disableIntrospection') {
      return this.buildDisableIntrospectionRule({}, defaultNamePrefix)
    } else if ('disableIntrospection' in rule) {
      return this.buildDisableIntrospectionRule(
        rule.disableIntrospection,
        defaultNamePrefix,
      )
    }

    const action = rule.action || 'Allow'
    const overrideAction = rule.overrideAction

    const result = {
      Name: rule.name,
      Priority: rule.priority,
      Statement: rule.statement,
      VisibilityConfig: this.getWafVisibilityConfig(
        rule.visibilityConfig,
        rule.name,
      ),
    }

    if (overrideAction) {
      result.OverrideAction = toCfnKeys(overrideAction)
    } else {
      result.Action = { [action]: {} }
    }

    return result
  }

  buildApiKeysWafRules() {
    return (
      reduce(
        this.api.config.apiKeys,
        (rules, key) => rules.concat(this.buildApiKeyRules(key)),
        [],
      ) || []
    )
  }

  buildApiKeyRules(key) {
    const rules = key.wafRules
    // Build the rule and add a matching rule for the X-Api-Key header
    // for the given api key
    const allRules = []
    rules?.forEach((keyRule) => {
      const builtRule = this.buildWafRule(keyRule, key.name)
      const logicalIdApiKey = this.api.naming.getApiKeyLogicalId(key.name)
      const { Statement: baseStatement } = builtRule
      const apiKeyStatement = {
        ByteMatchStatement: {
          FieldToMatch: {
            SingleHeader: { Name: 'X-Api-key' },
          },
          PositionalConstraint: 'EXACTLY',
          SearchString: { 'Fn::GetAtt': [logicalIdApiKey, 'ApiKey'] },
          TextTransformations: [
            {
              Type: 'LOWERCASE',
              Priority: 0,
            },
          ],
        },
      }

      let statement
      if (baseStatement && baseStatement?.RateBasedStatement) {
        let ScopeDownStatement
        // For RateBasedStatement, use the api rule as ScopeDownStatement
        // merge if with existing needed
        if (baseStatement.RateBasedStatement?.ScopeDownStatement) {
          ScopeDownStatement = this.mergeWafRuleStatements([
            baseStatement.RateBasedStatement.ScopeDownStatement,
            apiKeyStatement,
          ])
        } else {
          ScopeDownStatement = apiKeyStatement
        }
        // RateBasedStatement
        statement = {
          RateBasedStatement: {
            ...baseStatement.RateBasedStatement,
            ScopeDownStatement,
          },
        }
      } else if (!isEmpty(baseStatement)) {
        // Other rules: combine them (And Statement)
        statement = this.mergeWafRuleStatements([
          baseStatement,
          apiKeyStatement,
        ])
      } else {
        // No statement, the rule is the API key rule itself
        statement = apiKeyStatement
      }

      allRules.push({
        ...builtRule,
        Statement: statement,
      })
    })

    return allRules
  }

  mergeWafRuleStatements(statements) {
    return {
      AndStatement: {
        Statements: statements,
      },
    }
  }

  getWafVisibilityConfig(visibilityConfig = {}, defaultName) {
    return {
      CloudWatchMetricsEnabled:
        visibilityConfig.cloudWatchMetricsEnabled ??
        this.config.visibilityConfig?.cloudWatchMetricsEnabled ??
        true,
      MetricName: visibilityConfig.name || defaultName,
      SampledRequestsEnabled:
        visibilityConfig.sampledRequestsEnabled ??
        this.config.visibilityConfig?.sampledRequestsEnabled ??
        true,
    }
  }

  buildDisableIntrospectionRule(config, defaultNamePrefix) {
    const Name = config.name || `${defaultNamePrefix || ''}DisableIntrospection`

    return {
      Action: {
        Block: {},
      },
      Name,
      Priority: config.priority,
      Statement: {
        OrStatement: {
          Statements: [
            {
              // Block all requests > 8kb
              // https://docs.aws.amazon.com/waf/latest/developerguide/web-request-body-inspection.html
              SizeConstraintStatement: {
                ComparisonOperator: 'GT',
                FieldToMatch: {
                  Body: {},
                },
                Size: 8 * 1024,
                TextTransformations: [
                  {
                    Type: 'NONE',
                    Priority: 0,
                  },
                ],
              },
            },
            {
              ByteMatchStatement: {
                FieldToMatch: {
                  Body: {},
                },
                PositionalConstraint: 'CONTAINS',
                SearchString: '__schema',
                TextTransformations: [
                  {
                    Type: 'COMPRESS_WHITE_SPACE',
                    Priority: 0,
                  },
                ],
              },
            },
          ],
        },
      },
      VisibilityConfig: this.getWafVisibilityConfig(
        typeof config === 'object' ? config.visibilityConfig : undefined,
        Name,
      ),
    }
  }

  buildThrottleRule(config, defaultNamePrefix) {
    let Name = `${defaultNamePrefix || ''}Throttle`
    let Limit = 100
    let AggregateKeyType = 'IP'
    let ForwardedIPConfig
    let Priority
    let ScopeDownStatement

    if (typeof config === 'number') {
      Limit = config
    } else if (typeof config === 'object') {
      Name = config.name || Name
      AggregateKeyType = config.aggregateKeyType || AggregateKeyType
      Limit = config.limit || Limit
      Priority = config.priority
      ScopeDownStatement = config.scopeDownStatement
      if (AggregateKeyType === 'FORWARDED_IP') {
        ForwardedIPConfig = {
          HeaderName: config.forwardedIPConfig?.headerName || 'X-Forwarded-For',
          FallbackBehavior:
            config.forwardedIPConfig?.fallbackBehavior || 'MATCH',
        }
      }
    }

    return {
      Action: {
        Block: {},
      },
      Name,
      Priority,
      Statement: {
        RateBasedStatement: {
          AggregateKeyType,
          Limit,
          ForwardedIPConfig,
          ScopeDownStatement,
        },
      },
      VisibilityConfig: this.getWafVisibilityConfig(
        typeof config === 'object' ? config.visibilityConfig : undefined,
        Name,
      ),
    }
  }
}
