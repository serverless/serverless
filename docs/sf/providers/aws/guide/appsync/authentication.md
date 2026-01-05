# Authentication

[Authentication](https://docs.aws.amazon.com/appsync/latest/devguide/security-authz.html) definitions are found under the `appSync.authentication` (for the default authentication method) and `appSync.additionalAuthentications` (as an array) for additional ones

## Quick start

```yaml
appSync:
  authentication:
    type: 'API_KEY'
  additionalAuthentications:
    - type: 'AMAZON_COGNITO_USER_POOLS'
      config:
        userPoolId: '123456789'
```

## Configuration

- `type`: The type of authentication. Can be `API_KEY`, `AWS_IAM`, `AMAZON_COGNITO_USER_POOLS`, `AWS_LAMBDA` or `OPENID_CONNECT`
- `config`: The configuration for the provided `type` (See below).

### API Keys

Enables the API Key based authentication. See the [API Keys section](API-keys.md) to see how to configure them.

```yaml
appSync:
  authentication:
    type: 'API_KEY'
```

`config` is not required for this type.

### IAM

Allows IAM users and roles to access the API.

```yaml
appSync:
  authentication:
    type: 'AWS_IAM'
```

`config` is not required for this type.

### Cognito

Allows authentication using a Cognito user pool.

```yaml
appSync:
  authentication:
    type: 'AMAZON_COGNITO_USER_POOLS'
    config:
      userPoolId: '123456789'
```

- `userPoolId`: The user pool id to use.
- `awsRegion`: The region where the user pool is located. Defaults to the stack's region.
- `appIdClientRegex`: An optional regular expression for validating the incoming Amazon Cognito user pool app client ID.
- `defaultAction`: `ALLOW` or `DENY`. The action that you want your GraphQL API to take when a request that uses Amazon Cognito user pool authentication doesn't match the Amazon Cognito user pool configuration. When specifying Amazon Cognito user pools as the default authentication, you must set this value to `ALLOW` if specifying additionalAuthentications. Default: `ALLOW`. This field is only available for the default `authorization` configuration.

### OIDC

Allows users to authenticate against the API using a third-party OIDC auth provider.

```yaml
appSync:
  authentication:
    type: 'OPENID_CONNECT'
    config:
      issuer: 'https://auth.example.com'
      clientId: '5fbc318d-5920-48a8-92ea-20d62d16cc60'
```

- `issuer`: The issuer of this OIDC config.
- `clientId`: Optional. The client identifier of the Relying party at the OpenID identity provider. This identifier is typically obtained when the Relying party is registered with the OpenID identity provider. You can specify a regular expression so that AWS AppSync can validate against multiple client identifiers at a time.
- `iatTTL`: Optional. The number of milliseconds that a token is valid after it's issued to a user.
- `authTTL`: Optional. The number of milliseconds that a token is valid after being authenticated.

### Lambda

Allows custom authentication through Lambda.

```yaml
appSync:
  authentication:
    type: 'AWS_LAMBDA'
    config:
      authorizerResultTtlInSeconds: 300
      function:
        timeout: 30
        handler: 'functions/auth.handler'
```

- `identityValidationExpression`: Optional. A regular expression for validation of tokens before the Lambda function is called.
- `authorizerResultTtlInSeconds`: Optional. The number of seconds a response should be cached for. The default is 5 minutes (300 seconds).
- `function`: A Lambda function definition as you would define it under the `functions` section of your `serverless.yml` file.
- `functionName`: The name of the function as defined under the `functions` section of the `serverless.yml` file
- `functionAlias`: A specific function alias to use.
- `functionArn`: The function ARN to use.
