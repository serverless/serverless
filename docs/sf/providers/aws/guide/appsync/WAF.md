<!--
title: Serverless Framework - AppSync - Web Application Firewall (WAF)
description: How to configure Web Application Firewall (WAF) for AWS AppSync with the Serverless Framework.
short_title: AppSync - WAF
keywords:
  [
    'Serverless Framework',
    'AppSync',
    'WAF',
    'Web Application Firewall',
    'GraphQL',
    'AWS',
  ]
-->

# Web Application Firewall (WAF)

AppSync [supports WAF](https://aws.amazon.com/blogs/mobile/appsync-waf/). WAF is an Application Firewall that helps you protect your API against common web exploits.

The AppSync integration comes with some handy pre-defined rules that you can enable in just a few lines of code.

You can configure WAF rules under the `appSync.waf` attribute.

## Quick start

You can define a collection of rules for your web ACL and associate it:

```yaml
appSync:
  name: my-api
  waf:
    enabled: true
    defaultAction: 'Allow'
    rules:
      - throttle
      - disableIntrospection
```

Or directly associate an existing web ACL:

```yaml
appSync:
  name: my-api
  waf:
    enabled: true
    arn: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-Waf/d7b694d2-4f7d-4dd6-a9a9-843dd1931330'
```

## Configuration

- `enabled`: Boolean. Enable or disable WAF. Defaults to `true` when `appSync.waf` is defined.
- `arn`: Optional. The WAF's ARN to associate with your AppSync resource.
- `name`: Optional. The name of this WAF instance. Defaults to the name of your API.
- `defaultAction`: Optional. The default action if a request does not match a rule. `Allow` or `Block`. Defaults to `Allow`.
- `description`: Optional. A description for this WAF instance.
- `visibilityConfig`: Optional. A [visibility config](https://docs.aws.amazon.com/waf/latest/APIReference/API_VisibilityConfig.html) for this WAF
  - `name`: Metric name
  - `cloudWatchMetricsEnabled`: A boolean indicating whether the associated resource sends metrics to Amazon CloudWatch
  - `sampledRequestsEnabled`: A boolean indicating whether AWS WAF should store a sampling of the web requests that match the rule
- `rules`: Required. An array of [rules](#rules). Optional when `arn` is present

## Rules

### Configuration

Common configuration to all rules:

- `name`: The name of the rule
- `action`: How this rule should handle the incoming request when matching the rule. `Allow` or `Deny`. Defaults to `Allow`.
- `priority`: The priority of this rule. See [Rules Priority](#rules-priority)
- `visibilityConfig`: The [visibility config](https://docs.aws.amazon.com/waf/latest/APIReference/API_VisibilityConfig.html) for this rule.

### Throttling

Throttling will disallow requests coming from the same ip address when a limit is reached within a 5-minutes period. It corresponds to a rules with a [RateBasedStatement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-wafv2-webacl-ratebasedstatement.html).

Examples:

```yml
waf:
  enabled: true
  rules:
    - throttle # limit to 100 requests per 5 minutes period
    - throttle: 200 # limit to 200 requests per 5 minutes period
    - throttle:
        limit: 200
        priority: 10
        aggregateKeyType: FORWARDED_IP
        forwardedIPConfig:
          headerName: 'X-Forwarded-For'
          fallbackBehavior: 'MATCH'
```

#### Configuration

See the [CloudFormation documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-wafv2-webacl-ratebasedstatement.html)

- `aggregateKeyType`: `IP` or `FORWARDED_IP`
- `limit`: The limit of requests in a 5-minutes window for the same IP address.
- `forwardedIPConfig`: [forwardedIPConfig](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-wafv2-webacl-forwardedipconfiguration.html)
- `scopeDownStatement`: [WebACL Statement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-wafv2-webacl-statement.html)

### Disable Introspection

Sometimes, you want to disable introspection to disallow untrusted consumers to discover the structure of your API.

```yml
waf:
  enabled: true
  rules:
    - disableIntrospection # disables introspection for everyone
    - disableIntrospection: # using custom configuration
        name: Disable introspection
        priority: 200
```

### Custom rules

You can also specify custom rules. For more info on how to define a rule, see the [Cfn documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-wafv2-webacl-rule.html)

Example:

```yml
waf:
  enabled: true
  defaultAction: Block
  rules:
    # Only allow US users
    - action: Allow
      name: UsOnly
      statement:
        GeoMatchStatement:
          CountryCodes:
            - US
```

```yml
waf:
  enabled: true
  defaultAction: Block
  rules:
    # using ManagedRuleGroup
    - name: 'AWSManagedRulesCommonRuleSet'
      priority: 20
      overrideAction:
        None: {}
      statement:
        ManagedRuleGroupStatement:
          VendorName: 'AWS'
          Name: 'AWSManagedRulesCommonRuleSet'
```

### Per API Key rules

In some cases, you might want to enable a rule for a given API key only. You can specify `wafRules` under the `appSync.apiKeys` attribute. The rules will apply only to that API key.

```yml
apiKeys:
  - name: MyApiKey
    expiresAfter: 365d
    wafRules:
      - throttle # throttles this API key
      - disableIntrospection # disables introspection for this API key
```

Adding a rule to an API key without any _statement_ will add a _match-all_ rule for that key (all requests will match that rule). This is useful for example to exclude API keys from global rules. In that case, you need to make sure to attribute a higher priority to that rule.

Example:

- Block all requests by default, except in the US.
- The `WorldWideApiKey` API key should be excluded from that rule.

```yml
appSync:
  waf:
    enabled: true
    defaultAction: Block # Block all by default
    rules:
      # allow US requests
      - action: Allow
        name: UsOnly
        priority: 5
        statement:
          geoMatchStatement:
            countryCodes:
              - US
  apiKeys:
    - name: Key1 # no rule is set, the global rule applies (US only)
    - name: Key1 # no rule is set, the global rule applies (US only)
    - name: WorldWideApiKey
      wafRules:
        - name: WorldWideApiKeyRule
          action: Allow
          priority: 1 # Since priority is higher than 5, all requests will be Allowed
```

### Rules priority

The priorities don't need to be consecutive, but they must all be different.

Setting a priority to the rules is not required, but recommended. If you don't set priority, it will be automatically attributed and sequentially incremented according to the following rules:

First the global rules (under `appSync.waf.rules`), in the order that they are defined, then the API key rules, in order of the API keys and their rules.

Auto-generated priorities start at 100. This gives you som room (0-99) to add other rules that should get a higher priority, if you need to.

For more info about how rules are executed, pease refer to [the documentation](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-processing.html)

Example:

```yml
appSync:
  waf:
    enabled: true
    rules:
      - name: Rule1
        # (no-set) Priority = 100
      - name: Rule2
        priority: 5 # Priority = 5
      - name: Rule3
        # (no-set) Priority = 101
  apiKeys:
    - name: Key1
      wafRules:
        - name: Rule4
          # (no-set) Priority = 102
        - name: Rule5
          # (no-set) Priority = 103
    - name: Key
      wafRules:
        - name: Rule6
          priority: 1 # Priority = 1
        - name: Rule7
          # (no-set) Priority = 104
```
