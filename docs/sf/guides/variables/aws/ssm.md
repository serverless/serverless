<!--
title: SSM Parameter Store and Secrets Manager Variables
description: Read SSM parameters and Secrets Manager secrets in serverless.yml with ssm variables, including SecureString decryption, StringList, raw values and Regions.
short_title: SSM Parameter Store & Secrets Manager
keywords:
  [
    'Serverless Framework',
    'AWS SSM',
    'Parameter Store',
    'Secrets Manager',
    'ssm variable',
    'SecureString',
    'Variables',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/aws/ssm)

<!-- DOCS-SITE-LINK:END -->

# SSM Parameter Store and Secrets Manager Variables

A `${ssm:<parameter>}` variable reads a parameter from AWS Systems Manager Parameter Store, or a secret from AWS Secrets Manager through Parameter Store, while the Serverless Framework loads `serverless.yml`. Use it to keep secrets and per-environment settings out of `serverless.yml`.

The following `serverless.yml` reads the `/my-service/dev/db-host` parameter into an environment variable:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    environment:
      DB_HOST: ${ssm:/my-service/${sls:stage}/db-host}
```

The Framework reads parameters with the deployment credentials, in the Region the [AWS variables use](./README.md#region). A value resolved into `environment` is stored in the Lambda function's configuration in plain text.

## Syntax of the ssm variable

```text
${ssm:PARAMETER_NAME}
${ssm(REGION):PARAMETER_NAME}
${ssm(raw):PARAMETER_NAME}
${ssm(noDecrypt):PARAMETER_NAME}
${ssm(REGION, raw):PARAMETER_NAME}
${aws:ssm:PARAMETER_NAME}
${RESOLVER_NAME:ssm:PARAMETER_NAME}
${RESOLVER_NAME:PARAMETER_NAME}
${RESOLVER_NAME:NESTED_RESOLVER_NAME:PARAMETER_NAME}
```

- `PARAMETER_NAME`: the parameter's name or path (`/my-service/dev/db-host`), its ARN, or a Secrets Manager reference (`/aws/reference/secretsmanager/SECRET_NAME`). Append `:VERSION` or `:LABEL` to read a specific parameter version or label.
- `REGION`: the Region of the parameter; see [Read parameters from another Region](#read-parameters-from-another-region).
- `raw`, `noDecrypt`: see [Parameter types and values](#parameter-types-and-values). With a Region, the Region comes first: in `${ssm(raw, eu-west-1):...}` the Region is ignored.
- `${ssm:...}` is the short form of `${aws:ssm:...}`; both use the deployment credentials.
- `RESOLVER_NAME`: an [AWS resolver](./README.md#configure-an-aws-resolver). Without a resolver type, `${RESOLVER_NAME:PARAMETER_NAME}` reads an SSM parameter; a name that contains `:`, such as an ARN or a `:VERSION` suffix, needs the `ssm` type: `${RESOLVER_NAME:ssm:PARAMETER_NAME}`.
- `NESTED_RESOLVER_NAME`: a nested resolver with `type: ssm`; see [SSM resolver settings](#ssm-resolver-settings).

When the parameter doesn't exist, the variable uses its default (`${ssm:/my-service/dev/db-host, 'localhost'}`), otherwise the command stops with a `Cannot resolve '${ssm:...}' variable` error. Other errors, such as missing AWS credentials, denied access or a KMS error, stop the command even when a default is set. To run without AWS access, see [Use local values without AWS access](#use-local-values-without-aws-access).

## Parameter types and values

The variable's value depends on the parameter type:

| Parameter type | Default                                                                              | With `raw`                       | With `noDecrypt`    |
| -------------- | ------------------------------------------------------------------------------------ | -------------------------------- | ------------------- |
| `String`       | The string, never parsed                                                             | The string                       | The string          |
| `StringList`   | A list, split on commas                                                              | The comma-separated string       | A list              |
| `SecureString` | The decrypted value; parsed into an object when it starts with `{` and is valid JSON | The decrypted string, not parsed | The encrypted value |

For example, a `StringList` parameter `/my-service/dev/subnet-ids` with the value `subnet-1,subnet-2` gives a list for `subnetIds` and the original string for `subnetIdsText`:

```yaml
custom:
  subnetIds: ${ssm:/my-service/dev/subnet-ids}
  subnetIdsText: ${ssm(raw):/my-service/dev/subnet-ids}
```

## Read Secrets Manager secrets

To read an AWS Secrets Manager secret, prefix its name with `/aws/reference/secretsmanager/`. Parameter Store returns the secret as a `SecureString`, so a JSON secret becomes an object and a plain-text secret stays a string:

```yaml
custom:
  dbCredentials: ${ssm:/aws/reference/secretsmanager/my-service/db-credentials}
  dbPassword: ${self:custom.dbCredentials.password}
```

If the `my-service/db-credentials` secret holds `{"username": "app", "password": "example-password"}`, `custom.dbCredentials` resolves to:

```yaml
custom:
  dbCredentials:
    username: app
    password: example-password
```

To read a version stage, append it to the name: `${ssm:/aws/reference/secretsmanager/my-service/db-credentials:AWSPREVIOUS}`. See [Referencing AWS Secrets Manager secrets from Parameter Store parameters](https://docs.aws.amazon.com/systems-manager/latest/userguide/integration-ps-secretsmanager.html).

## Use local values without AWS access

A default after the comma applies only when the parameter doesn't exist, so a command without AWS credentials stops at the first `${ssm:...}` variable even when it has a default. To run a stage such as `local` without AWS access, put the local value first and the `ssm` source after it as a fallback. The Framework uses the first source that has a value and makes no AWS request for the sources after it:

```yaml
stages:
  local:
    params:
      dbPassword: local-password
      subnetIds:
        - subnet-local-1
        - subnet-local-2
      dbCredentials:
        username: app
        password: local-password

custom:
  dbPassword: ${param:dbPassword, ssm:/my-service/${sls:stage}/db-password}
  subnetIds: ${param:subnetIds, ssm:/my-service/${sls:stage}/subnet-ids}
  dbCredentials: ${param:dbCredentials, ssm:/aws/reference/secretsmanager/my-service/${sls:stage}/db-credentials}
```

With `--stage local`, the three values come from the [stage parameters](../../parameters.md#stage-parameters), including the list and the object. Other stages have no such parameters, so the Framework reads SSM Parameter Store and Secrets Manager.

- Don't put the `${ssm:...}` variables in `stages.default.params`: the Framework resolves every variable in `serverless.yml`, including those under `stages.default`, for every stage, so they still need AWS access with `--stage local`.
- An environment variable works as the first source too (`${env:DB_PASSWORD, ssm:/my-service/${sls:stage}/db-password}`), but its value is always a string: a list or an object needs a stage parameter.

## Permissions for ssm variables

The identity that runs the Serverless Framework command needs these permissions: the deployment credentials for `${ssm:...}`, or the AWS resolver's credentials for `${RESOLVER_NAME:...}`. The Lambda function's execution role needs none of them, because the Framework resolves the value before it deploys.

- `ssm:GetParameter` on the parameter. The parameter `/my-service/dev/db-password` has the ARN `arn:aws:ssm:us-east-1:123456789012:parameter/my-service/dev/db-password` in `us-east-1`; a parameter read with `${ssm(eu-west-1):...}` has `eu-west-1` in its ARN.
- `kms:Decrypt` on the key, for a `SecureString` parameter encrypted with a customer managed key.
- `secretsmanager:GetSecretValue` on the secret, for a Secrets Manager reference, and `kms:Decrypt` on the secret's customer managed key, if it has one. Secrets Manager appends six random characters to the secret's ARN, so match them with `??????`: `arn:aws:secretsmanager:us-east-1:123456789012:secret:my-service/dev/db-credentials-??????`.

See [Setting permissions to encrypt and decrypt parameter values](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html#parameter-policy-kms-encryption) and [Secrets Manager identity-based policy examples](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access_iam-policies.html).

## Read parameters from another Region

To read a parameter in another Region, put the Region in parentheses:

```yaml
custom:
  euApiKey: ${ssm(eu-west-1):/my-service/api-key}
```

The Region in parentheses applies when the deployment credentials come from `provider.profile` or the default AWS credential chain, or from an `aws` resolver that doesn't set `region`.

## Read parameters with another account or profile

To read parameters with other credentials or settings, declare an [AWS resolver](./README.md#configure-an-aws-resolver), optionally with nested `ssm` resolvers. The following `serverless.yml` reads parameters from the account behind the `shared-account` profile, in the default Region, in `eu-west-1` and unparsed:

```yaml
stages:
  default:
    resolvers:
      sharedAccount:
        type: aws
        profile: shared-account
        euSsm:
          type: ssm
          region: eu-west-1
        rawSsm:
          type: ssm
          rawOrDecrypt: raw

provider:
  name: aws

functions:
  hello:
    handler: handler.hello
    environment:
      API_KEY: ${sharedAccount:ssm:/shared/api-key}
      EU_API_KEY: ${sharedAccount:euSsm:/shared/api-key}
      SUBNET_IDS: ${sharedAccount:rawSsm:/shared/subnet-ids}
```

This service also deploys with the `shared-account` profile: a single `type: aws` resolver supplies the deployment credentials when neither `provider.profile` nor `provider.resolver` is set. To deploy with other credentials, set `provider.profile`, or declare another `type: aws` resolver and name it in `provider.resolver`.

## SSM resolver settings

A nested resolver with `type: ssm` under an AWS resolver accepts these keys:

| Key            | Type   | Default                          | Description                                                                                                                              |
| -------------- | ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | String | Required                         | `ssm`.                                                                                                                                   |
| `region`       | String | The parent AWS resolver's Region | Region of the parameters. Applies only when the parent AWS resolver doesn't set `region`; when both set it, the parent's Region is used. |
| `rawOrDecrypt` | String | None                             | `raw` or `noDecrypt`, as in [Parameter types and values](#parameter-types-and-values). Other values are ignored.                         |

## Requests and rate limits

The Framework resolves all variables concurrently before a command runs and reads each parameter with the Parameter Store `GetParameter` API, so a service with many parameters makes many calls at once.

Parameter Store applies a throughput limit per AWS account and Region. When a call is throttled, the Framework retries it with the AWS SDK's standard exponential backoff, up to 10 attempts by default; run with `--verbose` to see each retry. When the retries run out, the command stops with the `RESOLVER_AWS_RATE_EXCEEDED` error, which names the API, the number of attempts and how many parameters the run referenced.

The retry settings follow the same precedence as in every AWS SDK and the AWS CLI: the `AWS_MAX_ATTEMPTS` and `AWS_RETRY_MODE` environment variables, then the `max_attempts` and `retry_mode` keys in `~/.aws/config`. The Framework default of 10 attempts applies only when none of them is set. See [Retry behavior in the AWS SDKs and Tools Reference Guide](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

If deployments in the same account and Region regularly reach the limit, enable [Parameter Store's higher throughput setting](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-throughput.html) for that account and Region.

## Related

- [AWS variables and resolvers](./README.md): the account ID, Region and partition, and AWS resolver settings.
- [Variables in serverless.yml](../README.md): syntax, defaults and the other variable sources.
- [Read string variable values as boolean values](../README.md#read-string-variable-values-as-boolean-values): convert a `"true"` parameter to a boolean.
