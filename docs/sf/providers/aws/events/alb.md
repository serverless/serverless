<!--
title: Application Load Balancer Events
description: 'Route requests from an existing Application Load Balancer listener to a Lambda function with the alb event: conditions, authentication, health checks.'
short_title: Application Load Balancer
keywords:
  [
    'Serverless Framework',
    'AWS Lambda ALB',
    'Application Load Balancer Lambda target',
    'ALB listener rule',
    'ALB Cognito authentication',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alb)

<!-- DOCS-SITE-LINK:END -->

# Application Load Balancer Events

The `alb` event sends HTTP requests from an [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) (ALB) to a Lambda function. The Framework adds a listener rule to an existing listener and creates a target group with the function as its target. The `alb` event doesn't create the load balancer or the listener: reference an existing listener, or declare one in `resources`. To expose a function over HTTP without a load balancer, use an [HTTP API](./http-api.md) instead.

This `serverless.yml` forwards requests for `/hello` on an existing listener to the `hello` function:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 1
          conditions:
            path: /hello
```

The handler returns the response the load balancer sends to the client:

```javascript
// handler.mjs
export const hello = async (event) => {
  return {
    statusCode: 200,
    statusDescription: '200 OK',
    isBase64Encoded: false,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: event.path }),
  }
}
```

The `alb` event takes three required keys:

- `listenerArn`: the ARN of an existing listener, or a `Ref` to an `AWS::ElasticLoadBalancingV2::Listener` declared under `resources`. A listener ARN ends with the load balancer ID and the listener ID (`.../app/<name>/<load-balancer-id>/<listener-id>`); any other form stops the deploy with `Invalid ALB listenerArn in function "<function>".`
- `priority`: the listener rule priority, an integer from 1 to 50000. The load balancer evaluates rules from the lowest priority up.
- `conditions`: at least one condition the request must match. Without one, the deploy stops with `Cannot setup "alb" event in "<function>" function: At least one condition must be defined`.

For each function and load balancer, the Framework creates one target group (one per `multiValueHeaders` value, and one per listener `Ref` when `listenerArn` is a `Ref`), one listener rule per `alb` event, and the `lambda:InvokeFunction` permission for `elasticloadbalancing.amazonaws.com`. When the function has provisioned concurrency, SnapStart or durable execution, the target is the function's alias.

## Rule priorities

Each `alb` event's `priority` must be unique on its listener: events of two functions with the same `priority` on one listener stop the deploy with `ALB event in function "<function>" cannot use priority "<priority>" because it is already in use.` The Framework names listener rules after the function and the priority, so give every `alb` event of one function its own `priority`. Two events of one function with the same `priority` stop the deploy with the same error when they're on different listeners; on the same listener, the later event's listener rule replaces the earlier one without an error.

## Listener rule conditions

The `alb` event's `conditions` combine with AND: a request must match every condition you set. Within one condition, a list matches when any of its values matches. A listener rule takes up to five match evaluations, and one condition up to three; each value counts as one. This example matches `POST` and `PATCH` requests for `/hello` on `example.com`, four match evaluations:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 1
          conditions:
            path: /hello
            method:
              - POST
              - PATCH
            host: example.com
```

This example matches a header, a query string parameter and a source IP range, three match evaluations:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 2
          conditions:
            header:
              name: foo
              values:
                - bar
            query:
              bar: 'true'
            ip:
              - 192.168.0.0/16
```

| Condition | Value                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `path`    | A path pattern or a list of them, up to 128 characters each. `*` and `?` are wildcards.                                 |
| `method`  | An HTTP method or a list of them, in uppercase, up to 40 characters each.                                               |
| `host`    | A host name pattern or a list of them, up to 128 characters each, with `*` and `?` wildcards.                           |
| `header`  | One `{ name, values }` object or a list of them. `name` up to 40 characters; `values` a list of strings up to 128 each. |
| `query`   | A map of query string parameter names to values, up to 128 characters each.                                             |
| `ip`      | A list of source IP ranges in CIDR notation, IPv4 or IPv6.                                                              |

AWS describes how each condition matches, and the match evaluation limits, in [listener rule condition types](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/rule-condition-types.html).

## Add Cognito/custom IdP provider authentication

An ALB can [authenticate users](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html) with an Amazon Cognito user pool or an OpenID Connect (OIDC) identity provider before it forwards the request to the function. Define the authorizers under `provider.alb.authorizers`, then name them in the `alb` event's `authorizer`.

The following `provider.alb.authorizers` defines a Cognito authorizer and an OIDC authorizer:

```yaml
provider:
  name: aws
  alb:
    authorizers:
      myFirstAuth:
        type: cognito
        userPoolArn: arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_123412341
        userPoolClientId: 1h57kf5cpq17m0eml12EXAMPLE
        userPoolDomain: your-test-domain
        onUnauthenticatedRequest: deny
        requestExtraParams:
          prompt: login
          redirect: 'false'
        scope: 'first_name age'
        sessionCookieName: my-session-cookie
        sessionTimeout: 7000
      mySecondAuth:
        type: oidc
        authorizationEndpoint: https://example.com/authorize
        clientId: i-am-client
        clientSecret: ${ssm:/my-service/oidc-client-secret}
        issuer: https://example.com
        tokenEndpoint: https://example.com/token
        userInfoEndpoint: https://example.com/userinfo
        onUnauthenticatedRequest: authenticate
```

A `cognito` authorizer requires `userPoolArn`, `userPoolClientId` and `userPoolDomain`. An `oidc` authorizer requires `authorizationEndpoint`, `clientId`, `issuer`, `tokenEndpoint` and `userInfoEndpoint`, each endpoint a full HTTPS URL. Both types accept these optional keys:

| Key                        | Value                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onUnauthenticatedRequest` | `deny` (default) returns HTTP 401; `allow` forwards the request to the function; `authenticate` redirects to the identity provider's authorization endpoint.                      |
| `requestExtraParams`       | Up to 10 query parameters added to the redirect to the authorization endpoint, as string values.                                                                                  |
| `scope`                    | The claims to request from the identity provider, separated by spaces. AWS's default is `openid`.                                                                                 |
| `sessionCookieName`        | The name of the cookie that holds the session. AWS's default is `AWSELBAuthSessionCookie`.                                                                                        |
| `sessionTimeout`           | The maximum session duration in seconds, an integer of 0 or more. AWS's default is 604800 (7 days).                                                                               |
| `clientSecret` (`oidc`)    | The OIDC client secret. Required when the rule is created. When you omit it, the Framework tells the load balancer to keep the secret it already has (`UseExistingClientSecret`). |

Store the client secret outside `serverless.yml`, for example as an `${ssm:...}` variable as in the example.

To protect an endpoint, name one authorizer in the `alb` event's `authorizer`. A listener rule takes one authentication action, so use a separate `alb` event, with its own `priority` and conditions, for each authorizer:

```yaml
functions:
  auth:
    handler: handler.auth
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 1
          conditions:
            path: /auth/cognito
          authorizer: myFirstAuth
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 2
          conditions:
            path: /auth/idp
          authorizer: mySecondAuth
```

The listener rule runs the authenticate action, then forwards the request to the function. A name that isn't defined in `provider.alb.authorizers` stops the deploy with `No match for "<name>" in function "<function>" found in registered ALB authorizers`. Authentication works only on HTTPS listeners.

## Multi-value headers

When a request repeats a header or a query string parameter, the load balancer passes only the last value to the function. To receive all values as arrays, set the `alb` event's `multiValueHeaders` to `true` (default: `false`):

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 1
          multiValueHeaders: true
          conditions:
            path: /hello
```

With `multiValueHeaders: true`, the event carries `multiValueHeaders` and `multiValueQueryStringParameters` instead of `headers` and `queryStringParameters`. The response must set headers in `multiValueHeaders` too; the load balancer ignores `headers`:

```javascript
// handler.mjs
export const hello = async (event) => {
  const headers = event.multiValueHeaders
  const query = event.multiValueQueryStringParameters

  return {
    statusCode: 200,
    statusDescription: '200 OK',
    isBase64Encoded: false,
    multiValueHeaders: {
      'Content-Type': ['application/json'],
      'Set-Cookie': ['language=en-us', 'theme=rust'],
    },
    body: JSON.stringify({ headers, query }),
  }
}
```

The setting is an attribute of the target group, so a function with `alb` events that differ in `multiValueHeaders` gets one target group for each value.

## Target group names

The Framework names each target group with the 32-character MD5 hash of the service name, function name, load balancer ID, multi-value setting and stage. Target group names must be unique per Region and account.

To start generated names with a common prefix, set `provider.alb.targetGroupPrefix` (up to 16 characters). The name is the prefix followed by the hash, cut to 32 characters:

```yaml
provider:
  name: aws
  alb:
    targetGroupPrefix: my-prefix
```

To choose the full name of one function's target group, set the `alb` event's `targetGroupName`: up to 32 letters, digits and hyphens, unique per Region and account.

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 1
          targetGroupName: hello-target-group
          conditions:
            path: /hello
```

`targetGroupName` and `provider.alb.targetGroupPrefix` are alternatives; setting both stops the deploy with `ALB "targetGroupName" setting is exclusive with "provider.alb.targetGroupPrefix": Please specify only one.`

## Health checks

Health checks for a target group with a Lambda target are off by default. To turn them on with the Framework's default settings, set the `alb` event's `healthCheck` to `true`:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 1
          conditions:
            path: /hello
          healthCheck: true
```

An object turns health checks on too, and changes the settings it names:

```yaml
functions:
  hello:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2
          priority: 1
          conditions:
            path: /hello
          healthCheck:
            path: /health
            intervalSeconds: 35
            timeoutSeconds: 30
            healthyThresholdCount: 2
            unhealthyThresholdCount: 2
            matcher:
              httpCode: '200,201'
```

| Key                       | Default | Allowed values                                                               |
| ------------------------- | ------- | ---------------------------------------------------------------------------- |
| `path`                    | `/`     | 1 to 1024 characters                                                         |
| `intervalSeconds`         | `35`    | 5 to 300                                                                     |
| `timeoutSeconds`          | `30`    | 2 to 120                                                                     |
| `healthyThresholdCount`   | `5`     | 2 to 10                                                                      |
| `unhealthyThresholdCount` | `5`     | 2 to 10                                                                      |
| `matcher.httpCode`        | `'200'` | A code, a range or a comma-separated list: `'200'`, `'200-299'`, `'200,201'` |

The load balancer invokes the function for each health check. AWS describes the settings in [health checks for target groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html).

## Related

- [Lambda functions as targets](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html): the event and response formats.
- [ALB settings in the `serverless.yml` reference](../guide/serverless.yml.md#alb)
- [HTTP API events](./http-api.md): HTTP endpoints without a load balancer.
