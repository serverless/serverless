<!--
title: AppSync WAF
description: 'Protect an AppSync API with AWS WAF (Web Application Firewall) from serverless.yml: rate limiting, introspection blocking, custom and managed rules.'
short_title: AppSync WAF
keywords:
  [
    'Serverless Framework',
    'AppSync WAF',
    'AppSync Web Application Firewall',
    'AWS WAF web ACL',
    'AppSync rate limiting',
    'AppSync disable introspection',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/WAF)

<!-- DOCS-SITE-LINK:END -->

# AppSync WAF

The `appSync.waf` block puts an AWS WAF (Web Application Firewall) web ACL in front of an AppSync API, so that WAF rules can block, allow, count or challenge requests before they reach your resolvers. The Framework creates a regional web ACL from the rules you list and associates it with the API, or associates a web ACL you already have. Ready-made rules cover per-IP rate limiting and introspection blocking; custom rules take any AWS WAF statement.

This configuration limits each IP address to 1000 requests per 5 minutes and blocks introspection queries:

```yaml
appSync:
  name: blog-api
  waf:
    rules:
      - throttle: 1000
      - disableIntrospection
```

To associate an existing web ACL instead, set its ARN:

```yaml
appSync:
  name: blog-api
  waf:
    arn: arn:aws:wafv2:us-east-1:123456789012:regional/webacl/blog-api-acl/a1b2c3d4-5678-90ab-cdef-EXAMPLE11111
```

## WAF keys

| Key                | Type                | Default                            | Description                                                                                                                 |
| ------------------ | ------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | boolean             | `true`                             | Set to `false` to remove the web ACL and its association while keeping the block.                                           |
| `arn`              | string or intrinsic | None                               | The ARN of an existing regional web ACL. With `arn`, the Framework creates only the association and ignores the other keys. |
| `rules`            | list                | Required without `arn`             | The rules, described in the following sections.                                                                             |
| `name`             | string              | `<API name>Waf`                    | The web ACL name.                                                                                                           |
| `defaultAction`    | `Allow` or `Block`  | `Allow`                            | What WAF does with a request that matches no rule.                                                                          |
| `description`      | string              | `ACL rules for AppSync <API name>` | The web ACL description.                                                                                                    |
| `visibilityConfig` | object              | See next table                     | CloudWatch metrics and request sampling for the web ACL, and the defaults for its rules.                                    |

`visibilityConfig`, on the web ACL and on each rule, takes these keys:

| Key                        | Type    | Default                          | Description                           |
| -------------------------- | ------- | -------------------------------- | ------------------------------------- |
| `name`                     | string  | The web ACL's or rule's name     | The CloudWatch metric name.           |
| `cloudWatchMetricsEnabled` | boolean | The web ACL's value, else `true` | Sends metrics to CloudWatch.          |
| `sampledRequestsEnabled`   | boolean | The web ACL's value, else `true` | Stores a sample of matching requests. |

The web ACL is tagged with `appSync.tags`. AWS bills each web ACL, rule and request; see [AWS WAF pricing](https://aws.amazon.com/waf/pricing/).

## Throttle rule

The `throttle` rule blocks an IP address that sends more than `limit` requests in 5 minutes, with an AWS WAF [rate-based statement](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-wafv2-webacl-ratebasedstatement.html). It has three forms:

```yaml
appSync:
  name: blog-api
  waf:
    rules:
      # 100 requests per 5 minutes per IP address
      - throttle
```

```yaml
appSync:
  name: blog-api
  waf:
    rules:
      # 500 requests per 5 minutes per IP address
      - throttle: 500
```

```yaml
appSync:
  name: blog-api
  waf:
    rules:
      # 500 requests per 5 minutes per client IP from a header, for clients behind a proxy
      - throttle:
          name: ThrottleByClientIp
          limit: 500
          priority: 10
          aggregateKeyType: FORWARDED_IP
          forwardedIPConfig:
            headerName: X-Forwarded-For
            fallbackBehavior: MATCH
```

| Key                                  | Type                   | Default                         | Description                                                                                            |
| ------------------------------------ | ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `limit`                              | integer, at least 100  | `100`                           | Requests allowed per IP address in a 5-minute window.                                                  |
| `aggregateKeyType`                   | `IP` or `FORWARDED_IP` | `IP`                            | Counts requests by source IP, or by the IP address in a header.                                        |
| `forwardedIPConfig.headerName`       | string                 | Required in `forwardedIPConfig` | With `FORWARDED_IP`: the header holding the client IP.                                                 |
| `forwardedIPConfig.fallbackBehavior` | `MATCH` or `NO_MATCH`  | Required in `forwardedIPConfig` | With `FORWARDED_IP`: whether a request without a valid header counts as matching.                      |
| `scopeDownStatement`                 | object                 | None                            | An AWS WAF statement, in CloudFormation's PascalCase keys, that limits which requests the rule counts. |
| `name`                               | string                 | `Throttle`                      | The rule name.                                                                                         |
| `priority`                           | integer                | Generated                       | See [Rules priority](#rules-priority).                                                                 |
| `visibilityConfig`                   | object                 | See [WAF keys](#waf-keys)       | Metrics and sampling for the rule.                                                                     |

When a `FORWARDED_IP` rule has no `forwardedIPConfig`, the Framework uses `X-Forwarded-For` as `headerName` and `MATCH` as `fallbackBehavior`. When you set `forwardedIPConfig`, set both keys; with only one of them, configuration validation reports `must be a valid WAF rule`: a warning by default, and an error that stops the command with `configValidationMode: error`.

A throttle rule always blocks the requests over the limit.

## Disable introspection rule

The `disableIntrospection` rule blocks GraphQL introspection queries, so that untrusted clients can't read the API's schema:

```yaml
appSync:
  name: blog-api
  waf:
    rules:
      - disableIntrospection
```

The rule blocks every request whose body contains `__schema`, and every request whose body is larger than 8 KB, the part of the body AWS WAF inspects for AppSync. If clients send larger requests, use the [`introspection: false`](./general-config.md#appsync-api-wide-keys) API setting instead, which turns introspection off in AppSync itself. To set the rule's name, priority or `visibilityConfig`, use the object form:

```yaml
appSync:
  name: blog-api
  waf:
    rules:
      - disableIntrospection:
          name: BlockIntrospection
          priority: 200
```

## Custom rules

A custom rule takes any AWS WAF rule statement. This web ACL blocks all requests except those from the United States:

```yaml
appSync:
  name: blog-api
  waf:
    defaultAction: Block
    rules:
      - name: UsOnly
        action: Allow
        statement:
          GeoMatchStatement:
            CountryCodes:
              - US
```

| Key                | Type                                   | Default                   | Description                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | string                                 | Required                  | The rule name.                                                                                                                                                                                                                                    |
| `statement`        | object                                 | Required                  | An AWS WAF [rule statement](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-wafv2-webacl-statement.html). The Framework passes it to CloudFormation unchanged, so its keys use CloudFormation's PascalCase. |
| `action`           | `Allow`, `Block`, `Count` or `Captcha` | `Allow`                   | What WAF does with a matching request.                                                                                                                                                                                                            |
| `overrideAction`   | object                                 | None                      | For rule group statements: replaces `action`, for example `None: {}` to apply the group's own actions.                                                                                                                                            |
| `priority`         | number                                 | Generated                 | See [Rules priority](#rules-priority).                                                                                                                                                                                                            |
| `visibilityConfig` | object                                 | See [WAF keys](#waf-keys) | Metrics and sampling for the rule.                                                                                                                                                                                                                |

### AWS managed rule groups

To use an [AWS managed rule group](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html), reference it in a `ManagedRuleGroupStatement` and set `overrideAction: { None: {} }` so the group's own rule actions apply:

```yaml
appSync:
  name: blog-api
  waf:
    rules:
      - name: AWSManagedRulesCommonRuleSet
        priority: 20
        overrideAction:
          None: {}
        statement:
          ManagedRuleGroupStatement:
            VendorName: AWS
            Name: AWSManagedRulesCommonRuleSet
```

## Per-API-key rules

The `wafRules` list of an entry in [`appSync.apiKeys`](./API-keys.md) adds rules that apply only to requests made with that key. They take the same forms as the web ACL's rules:

```yaml
appSync:
  name: blog-api
  authentication:
    type: API_KEY
  waf:
    rules: []
  apiKeys:
    - name: partner
      wafRules:
        - throttle: 200
        - disableIntrospection
```

For each key rule, the Framework adds a match on the request's `x-api-key` header: combined with the rule's statement, or as the scope-down statement of a throttle rule. Default rule names get the key's name as a prefix (`partnerThrottle`). The rules join the same web ACL, so `appSync.waf` must be present.

Custom key rules need a `statement`, like other custom rules. To exempt a key from a global rule, give the key a rule with a lower priority number whose statement matches the requests the global rule would block. In this example, the web ACL blocks requests from outside the US, except requests with the `worldwide` key:

```yaml
appSync:
  name: blog-api
  authentication:
    type: API_KEY
  waf:
    defaultAction: Block
    rules:
      - name: UsOnly
        action: Allow
        priority: 5
        statement:
          GeoMatchStatement:
            CountryCodes:
              - US
  apiKeys:
    - name: mobileApp # the UsOnly rule applies
    - name: worldwide
      wafRules:
        - name: AllowWorldwideKey
          action: Allow
          priority: 1 # evaluated before UsOnly (priority 5)
          statement:
            NotStatement:
              Statement:
                GeoMatchStatement:
                  CountryCodes:
                    - US
```

## Rules priority

AWS WAF evaluates rules from the lowest `priority` number to the highest, and every rule in a web ACL needs a different priority. Rules without `priority` get one generated, starting at 100 and counting up: first the web ACL's rules in the order listed, then each API key's rules, in the order of the keys. Numbers 1 to 99 stay free for rules that must run first; a `priority` of `0` is treated as unset and gets a generated number.

Generated numbers don't skip numbers you set, so an explicit priority of 100 or more can collide with a generated one; set every priority explicitly, or keep explicit ones between 1 and 99. In this example, the comments show the priority each rule gets:

```yaml
appSync:
  name: blog-api
  authentication:
    type: API_KEY
  waf:
    rules:
      - throttle # 100
      - name: UsOnly # 5
        priority: 5
        statement:
          GeoMatchStatement:
            CountryCodes:
              - US
      - disableIntrospection # 101
  apiKeys:
    - name: partner
      wafRules:
        - throttle: 200 # 102
        - disableIntrospection # 103
```

For how AWS WAF evaluates rules and actions, see [Rule and rule group evaluation](https://docs.aws.amazon.com/waf/latest/developerguide/web-acl-processing.html).

## Related pages

- [AppSync API keys](./API-keys.md)
- [AppSync authentication](./authentication.md)
- [AWS WAF integration in AWS AppSync](https://docs.aws.amazon.com/appsync/latest/devguide/WAF-Integration.html)
