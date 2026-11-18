<!--
title: AppSync Authentication
description: 'Set the authorization modes of an AppSync API in serverless.yml: API key, IAM, Cognito user pools, OpenID Connect and Lambda authorizers.'
short_title: AppSync Authentication
keywords:
  [
    'Serverless Framework',
    'AppSync authorization',
    'AppSync Lambda authorizer',
    'AppSync Cognito user pool',
    'AppSync OIDC',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/authentication)

<!-- DOCS-SITE-LINK:END -->

# AppSync authentication

The `appSync.authentication` key sets the default [authorization mode](https://docs.aws.amazon.com/appsync/latest/devguide/security-authz.html) of an AppSync API, and `appSync.additionalAuthentications` adds more modes that clients can use instead. Use additional modes when different clients authenticate differently, for example a web app with Cognito user pools and a backend job with IAM.

This API accepts API keys by default and Cognito user pool tokens as an additional mode:

```yaml
appSync:
  name: blog-api
  authentication:
    type: API_KEY
  additionalAuthentications:
    - type: AMAZON_COGNITO_USER_POOLS
      config:
        userPoolId: us-east-1_aBcDeFgHi
  apiKeys:
    - name: defaultKey
```

Each entry, in `authentication` and in the `additionalAuthentications` list, has two keys:

- `type`: Required. `API_KEY`, `AWS_IAM`, `AMAZON_COGNITO_USER_POOLS`, `OPENID_CONNECT` or `AWS_LAMBDA`.
- `config`: The settings for that type. Required for `AMAZON_COGNITO_USER_POOLS`, `OPENID_CONNECT` and `AWS_LAMBDA`; not used for `API_KEY` and `AWS_IAM`.

## Rules for combining authorization modes

AppSync accepts `API_KEY`, `AWS_LAMBDA` and `AWS_IAM` at most once across `authentication` and `additionalAuthentications`. Cognito user pools and OpenID Connect providers can appear more than once, each with a different user pool or provider. When an API has additional modes, AppSync applies the default mode to every field, and you mark the fields and types that other modes may reach with directives in the schema, such as `@aws_api_key`, `@aws_iam`, `@aws_cognito_user_pools`, `@aws_oidc` and `@aws_lambda` (see the AWS guide linked in the opening).

## API key authentication

The `API_KEY` type authorizes requests that send a valid key in the `x-api-key` header:

```yaml
appSync:
  name: blog-api
  authentication:
    type: API_KEY
  apiKeys:
    - name: defaultKey
```

The Framework creates the keys listed in `appSync.apiKeys` only when `API_KEY` is the default or an additional mode; without `apiKeys`, it creates no key. Key names, expiry and per-key WAF rules are on the [AppSync API keys](./API-keys.md) page.

## IAM authentication

The `AWS_IAM` type authorizes requests signed with AWS Signature Version 4 by an IAM user or role whose policy allows `appsync:GraphQL` on the API's fields:

```yaml
appSync:
  name: blog-api
  authentication:
    type: AWS_IAM
```

## Cognito user pool authentication

The `AMAZON_COGNITO_USER_POOLS` type authorizes requests that send a token issued by an Amazon Cognito user pool:

```yaml
appSync:
  name: blog-api
  authentication:
    type: AMAZON_COGNITO_USER_POOLS
    config:
      userPoolId: us-east-1_aBcDeFgHi
      appIdClientRegex: '^my-app-client-id$'
      defaultAction: ALLOW
```

The `config` keys for Cognito user pools:

| Key                | Type                | Default              | Description                                                                                                                                                                                                 |
| ------------------ | ------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `userPoolId`       | string or intrinsic | Required             | The user pool ID, such as `us-east-1_aBcDeFgHi`, or `!Ref` to a user pool in `resources`.                                                                                                                   |
| `awsRegion`        | string or intrinsic | The service's Region | The Region of the user pool.                                                                                                                                                                                |
| `appIdClientRegex` | string or intrinsic | None                 | A regular expression that the token's app client ID must match.                                                                                                                                             |
| `defaultAction`    | `ALLOW` or `DENY`   | `ALLOW`              | What AppSync does with a valid token that doesn't match the user pool configuration. Applies only in `authentication`, not in `additionalAuthentications`. With additional modes, AppSync requires `ALLOW`. |

## OpenID Connect authentication

The `OPENID_CONNECT` type authorizes requests that send a token from a third-party OpenID Connect (OIDC) provider:

```yaml
appSync:
  name: blog-api
  authentication:
    type: OPENID_CONNECT
    config:
      issuer: https://auth.example.com
      clientId: 5fbc318d-5920-48a8-92ea-20d62d16cc60
```

The `config` keys for OIDC:

| Key        | Type   | Default  | Description                                                                                                  |
| ---------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `issuer`   | string | Required | The issuer URL, which must match the token's `iss` claim.                                                    |
| `clientId` | string | None     | The client identifier of the relying party at the provider. A regular expression matches several client IDs. |
| `iatTTL`   | number | None     | Milliseconds a token stays valid after it is issued.                                                         |
| `authTTL`  | number | None     | Milliseconds a token stays valid after the user authenticates.                                               |

## Lambda authorizer authentication

The `AWS_LAMBDA` type sends the request's `Authorization` header to a Lambda function that decides whether to allow it. This configuration defines the authorizer function inline:

```yaml
provider:
  name: aws
  runtime: nodejs24.x

appSync:
  name: blog-api
  authentication:
    type: AWS_LAMBDA
    config:
      authorizerResultTtlInSeconds: 300
      function:
        handler: functions/authorizer.handler
        timeout: 10
        environment:
          EXPECTED_TOKEN: ${ssm:/blog-api/authorizer-token}
```

The handler in `functions/authorizer.mjs` returns `isAuthorized` and, optionally, values that resolvers read from `ctx.identity.resolverContext`:

```javascript
export const handler = async (event) => {
  const token = event.authorizationToken

  return {
    isAuthorized: token === `Bearer ${process.env.EXPECTED_TOKEN}`,
    resolverContext: { client: 'internal' },
  }
}
```

The `config` keys for Lambda authorizers:

| Key                            | Type           | Default                           | Description                                                                                                                                          |
| ------------------------------ | -------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `function`                     | object         | None                              | A function definition, with the same keys as an entry under `functions`. The Framework adds it to `functions` under the name `<API name>Authorizer`. |
| `functionName`                 | string         | None                              | The key of a function defined under `functions` in the same `serverless.yml`.                                                                        |
| `functionAlias`                | string         | None                              | An alias of the `functionName` function to invoke.                                                                                                   |
| `functionArn`                  | string         | None                              | The ARN of an existing function.                                                                                                                     |
| `authorizerResultTtlInSeconds` | number, 0–3600 | `0` (AppSync default, no caching) | Seconds AppSync caches the function's response. The function can override it per response with `ttlOverride`.                                        |
| `identityValidationExpression` | string         | None                              | A regular expression the token must match before AppSync invokes the function.                                                                       |

Set exactly one of `function`, `functionName` or `functionArn`. The Framework adds a Lambda permission that lets `appsync.amazonaws.com` invoke the function from this API only. AppSync stops waiting for an authorizer after 10 seconds, so a longer function `timeout` doesn't help.

## Related pages

- [AppSync API keys](./API-keys.md)
- [AppSync WAF](./WAF.md): rate limiting and blocking in front of any authorization mode
- [AppSync overview](./README.md)
