<!--
title: Serverless Framework - AWS Lambda Events - ALB
menuText: Application Load Balancer
menuOrder: 9
description: Setting up AWS Application Load Balancer events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/alb)

<!-- DOCS-SITE-LINK:END -->

# Application Load Balancer

[Application Load Balancers](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) can be used to re-route requests when certain traffic patterns are met. While traffic can be routed to services such as EC2 it [can also be routed to Lambda functions](https://aws.amazon.com/de/blogs/networking-and-content-delivery/lambda-functions-as-targets-for-application-load-balancers/) which can in turn be used process incoming requests.

The Serverless Framework makes it possible to setup the connection between Application Load Balancers and Lambda functions with the help of the `alb` event.

## Event definition

```yml
functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          conditions:
            path: /hello
```

## Using different conditions

```yml
functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          conditions:
            host: example.com
            path: /hello
            method:
              - POST
              - PATCH
            host:
              - example.com
              - example2.com
            header:
              name: foo
              values:
                - bar
            query:
              bar: true
            ip:
              - fe80:0000:0000:0000:0204:61ff:fe9d:f156/6
              - 192.168.0.1/0
```

## Add cognito/custom idp provider authentication

With AWS you can configure an Application Load Balancer to [securely authenticate](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/listener-authenticate-users.html) users as they access your applications. To securely authenticate using Cognito and/or a identity provider (IdP) that is OpenID Connect (OIDC) compliant, follow below steps.

#### 1. Declare authorizer objects either of type "cognito" and/or "oidc" on `provider.alb.authorizers`

```yaml
provider:
  alb:
    authorizers:
      myFirstAuth:
        type: 'cognito'
        userPoolArn: 'arn:aws:cognito-idp:us-east-1:123412341234:userpool/us-east-1_123412341', # required
        userPoolClientId: '1h57kf5cpq17m0eml12EXAMPLE', # required
        userPoolDomain: 'your-test-domain' # required
        onUnauthenticatedRequest: 'deny' # If set to 'allow' this allows the request to be forwarded to the target when user is not authenticated. When omitted it defaults 'deny' which makes a HTTP 401 Unauthorized error be returned. Alternatively configure to 'authenticate' to redirect request to IdP authorization endpoint.
        requestExtraParams: # optional. The query parameters (up to 10) to include in the redirect request to the authorization endpoint
          prompt: 'login'
          redirect: false
        scope: 'first_name age' # Can be a combination of any system-reserved scopes or custom scopes associated with the client. The default is openid
        sessionCookieName: '🍪' # The name of the cookie used to maintain session information. The default is AWSELBAuthSessionCookie
        sessionTimeout: 7000 # The maximum duration of the authentication session, in seconds. The default is 604800 seconds (7 days).
      mySecondAuth:
        type: 'oidc'
        authorizationEndpoint: 'https://example.com', # required. The authorization endpoint of the IdP. Must be a full URL, including the HTTPS protocol, the domain, and the path
        clientId: 'i-am-client', # required
        clientSecret: 'i-am-secret', # if creating a rule this is required. If modifying a rule, this can be omitted if you set useExistingClientSecret to true (as below)
        useExistingClientSecret: true # only required if clientSecret is omitted
        issuer: 'https://www.iamscam.com', # required. The OIDC issuer identifier of the IdP. This must be a full URL, including the HTTPS protocol, the domain, and the path
        tokenEndpoint: 'http://somewhere.org', # required
        userInfoEndpoint: 'https://another-example.com' # required
        onUnauthenticatedRequest: 'deny' # If set to 'allow' this allows the request to be forwarded to the target when user is not authenticated. When omitted it defaults 'deny' which makes a HTTP 401 Unauthorized error be returned. Alternatively configure to 'authenticate' to redirect request to IdP authorization endpoint.
        requestExtraParams:
          prompt: 'login'
          redirect: false
        scope: 'first_name age'
        sessionCookieName: '🍪'
        sessionTimeout: 7000
```

#### 2. Configure endpoints which are expected to have restricted access with "authorizer" parameter:

```yml
functions:
  albEventConsumer:
    handler: handler.auth
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          conditions:
            path: /auth/cognito
          authorizer: myFirstAuth
```

```yml
functions:
  albEventConsumer:
    handler: handler.auth
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          conditions:
            path: /auth/idp
          authorizer:
            - myFirstAuth
            - mySecondAuth
```

## Enabling multi-value headers

By default when the request contains a duplicate header field name or query parameter key, the load balancer uses the last value sent by the client.

Set the `multiValueHeaders` attribute to `true` if you want to receive headers and query parameters as an array of values.

```yml
functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          multiValueHeaders: true
          conditions:
            path: /hello
```

When this option is enabled, the event structure is changed:

```javascript
module.exports.hello = async (event, context, callback) => {
  const headers = event.multiValueHeaders;
  const queryString = event.multiValueQueryStringParameters;

  ...

  return {
    statusCode: 200,
    statusDescription: '200 OK',
    isBase64Encoded: false,
    multiValueHeaders: {
      'Content-Type': ['application/json'],
      'Set-Cookie': ['language=en-us', 'theme=rust']
    }
  };
};
```

The handler response object must use `multiValueHeaders` to set HTTP response headers, `headers` would be ignored.

## Prepending a prefix to generated target group names

By default, target group names are strings generated by hashing a combined string of the function name, alb's id and whether multi-value headers are enabled. This produces a fixed length, unique id for target groups.

If you need target group names to have a common predictable prefix, you may preset the prefix with the `provider.alb.targetGroupPrefix` setting. Note maximum length of this prefix is 16 chars.

```yml
provider:
  alb:
    targetGroupPrefix: my-prefix

functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          conditions:
            path: /hello
```

## Specifying explicitly the target group names

If you want full control over the name used for the target group you can specify it using the `targetGroupName` property. Note that the name must be unique across the entire region and is limited to 32 characters with only alphanumerics and hyphens allowed.

This setting is exclusive with the `provider.alb.targetGroupPrefix` setting.

```yml
functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          targetGroupName: helloTargetGroup
          conditions:
            path: /hello
```

## Configuring Health Checks

Health checks for target groups with a _lambda_ target type are disabled by default.

To enable the health check on a target group associated with an alb event, set the alb event's `healthCheck` property to `true`.

```yml
functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
          priority: 1
          conditions:
            path: /hello
          healthCheck: true
```

If you need to configure advanced health check settings, you can provide additional health check configuration.

```yml
functions:
  albEventConsumer:
    handler: handler.hello
    events:
      - alb:
          listenerArn: arn:aws:elasticloadbalancing:us-east-1:12345:listener/app/my-load-balancer/50dc6c495c0c9188/
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
              httpCode: 200,201
```

All advanced health check settings are optional. If any advanced health check settings are present, the target group's health check will be enabled.
The target group's health check will use default values for any undefined settings.

Read the [AWS target group health checks documentation](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
for setting descriptions, constraints, and default values.
