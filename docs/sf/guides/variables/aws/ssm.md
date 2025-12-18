<!--
title: Serverless Framework - Variables - AWS SSM & Secrets Manager
description: How to reference AWS SSM Parameter Store & Secrets Manager
short_title: Serverless Variables - AWS SSM & Secrets Manager
keywords: ['Serverless Framework', 'AWS SSM', 'Secrets Manager', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/aws/ssm)

<!-- DOCS-SITE-LINK:END -->

# Configuration options

| Option         | Required |  Type  |              Default               | Description                                                                 |
| -------------- | :------: | :----: | :--------------------------------: | :-------------------------------------------------------------------------- |
| `region`       |    No    | String | Inherited from parent AWS resolver | AWS region                                                                  |
| `rawOrDecrypt` |    No    | String |                                    | `raw` or `noDecrypt` instruction to disable auto-parsing or auto-decrypting |

## Examples

### Default Configuration

In this example, `awsAccount1` is configured as the provider that references AWS SSM parameters.
This is the most straightforward case when you only need to access SSM parameters from a single region that matches your deployment.

```yaml
stages:
  default:
    resolvers:
      awsAccount1:
        type: aws

functions:
  hello:
    handler: handler.hello
    description: ${awsAccount1:ssm:/path/to/param}
```

### Custom region

In this example, the `awsAccount1` provider is set to use the `us-west-2` region.
However, within that, a specific `euSsm` resolver is defined to fetch SSM parameters from the `eu-west-`1 region.
This setup is useful when your deployment is based in one region, but you need to access SSM parameters from another region.

```yaml
stages:
  default:
    resolvers:
      awsAccount1:
        type: aws
        region: us-west-2
        euSsm:
          type: ssm
          region: eu-west-1

functions:
  hello:
    handler: handler.hello
    description: ${awsAccount1:euSsm:/path/to/param}
```

### Raw Parameter Value

By setting `rawOrDecrypt` to `raw`, the SSM parameter value is retrieved as-is, without any automatic parsing or transformation.
This is useful when you want the raw string from SSM, for example, when you need array values (`StringList`) to be returned as strings.

```yaml
stages:
  default:
    resolvers:
      awsAccount1:
        type: aws
        rawSsm:
          type: ssm
          rawOrDecrypt: raw

functions:
  hello:
    handler: handler.hello
    description: ${awsAccount1:rawSsm:/path/to/param}
```

### No Decrypt

In this scenario, the SSM parameter is of type SecureString, but you do not want it automatically decrypted.
This is useful if your use case involves handling the encrypted value directly
(e.g., for further processing or storing securely without exposing the plaintext value).

```yaml
stages:
  default:
    resolvers:
      awsAccount1:
        type: aws
        noDecryptSsm:
          type: ssm
          rawOrDecrypt: noDecrypt

functions:
  hello:
    handler: handler.hello
    description: ${awsAccount1:noDecryptSsm:/path/to/param}
```

# Classic (Pre-Resolvers) Format

You can reference SSM Parameters as the source of your variables with the `ssm:/path/to/param` syntax.
It uses the deployment (provider) AWS credentials to access SSM Parameter Store and Secrets Manager.
For example:

```yml
service: ${ssm:/path/to/service/id}-service
provider:
  name: aws
functions:
  hello:
    name: ${ssm:/path/to/service/myParam}-hello
    handler: handler.hello
```

In the above example, the value for the SSM Parameters will be looked up and used to populate the variables.

You can also reference SSM Parameters in another region with the `ssm(REGION):/path/to/param` syntax. For example:

```yml
service: ${ssm(us-west-2):/path/to/service/id}-service
provider:
  name: aws
functions:
  hello:
    name: ${ssm(ap-northeast-1):/path/to/service/myParam}-hello
    handler: handler.hello
```

## AWS Secrets Manager

Variables in [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) can be referenced [using SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/integration-ps-secretsmanager.html), just use the `ssm:/aws/reference/secretsmanager/secret_ID_in_Secrets_Manager` syntax. For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: hello
    handler: handler.hello
custom:
  secret: ${ssm:/path/to/secureparam}
  # AWS Secrets manager parameter
  supersecret: ${ssm:/aws/reference/secretsmanager/secret_ID_in_Secrets_Manager}
```

In this example, the serverless variable will contain the decrypted value of the secret.

Variables can also be object, since AWS Secrets Manager can store secrets not only in plain text but also in JSON.

If the above secret `secret_ID_in_Secrets_Manager` is something like below,

```json
{
  "num": 1,
  "str": "secret",
  "arr": [true, false]
}
```

variables will be resolved like

```yml
service: new-service
provider: aws
functions:
  hello:
    name: hello
    handler: handler.hello
custom:
  supersecret:
    num: 1
    str: secret
    arr:
      - true
      - false
```

### Resolve `StringList` as array of strings

Same `StringList` type parameters are automatically detected and resolved to array form. (Note: you can turn off resolution to array by passing `raw` instruction into variable as: `${ssm(raw):/path/to/stringlistparam}`, if you need to also pass custom region, put it first as: `${ssm(eu-west-1, raw):/path/to/stringlistparam}`)

```yml
service: new-service
provider: aws
functions:
  hello:
    name: hello
    handler: handler.hello
custom:
  myArrayVar: ${ssm:/path/to/stringlistparam}
```

### Resolution of non plain string types

Other types as `SecureString` and `StringList` are automatically resolved into expected forms.

#### Auto decrypting of `SecureString` type parameters.

All `SecureString` type parameters are automatically decrypted, and automatically parsed if they export stringified JSON content (Note: you can turn off parsing by passing `raw` instruction into variable as: `${ssm(raw):/path/to/secureparam}`, if you need to also pass custom region, put it first as: `${ssm(eu-west-1, raw):/path/to/secureparam}`)

In order to get the encrypted content, you can pass `noDecrypt` instruction into variable as: `${ssm(noDecrypt):/path/to/secureparam}` (it can be passed aside of region param as e.g.: `${ssm(eu-west-1, noDecrypt):/path/to/secureparam})`
