<!--
title: Serverless Framework - Variables
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
short_title: Variables
keywords:
  [
    'Serverless Framework',
    'Variables',
    'serverless.yml',
    'dynamic configuration',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables)

<!-- DOCS-SITE-LINK:END -->

# Variables

Variables allow users to dynamically replace config values in `serverless.yml` config.

They are especially useful when providing secrets for your service to use and when you are working with multiple stages.

## Syntax

To use variables, you will need to reference values enclosed in `${}` brackets.

```yml
# serverless.yml file
yamlKeyXYZ: ${provider:resolver:key} # see list of current resolver providers below
# this is an example of providing a default value as the second parameter
otherYamlKey: ${provider:resolver:key, defaultValue}
```

**Note:** You can only use variables in `serverless.yml` property **values**, not property keys. So you can't use variables to generate dynamic logical IDs in the custom resources section for example.

## Variable Resolvers

Variable Resolvers allow you to reference external data sources in your serverless.yml file.
Each Resolver has a Provider parent, which is responsible for fetching the credentials.
For example, the `aws` Provider has a `ssm` Resolver and a `s3` Resolver,
which can fetch data from AWS SSM Parameter Store and S3, respectively.

Providers can also have default variables that can be used in the serverless.yml file,
such as `accountId` for the `aws` Provider.

You can customize Providers and Resolvers by specifying custom configuration options in the `resolvers` block of the `stages` section.
Then, you can reference the customized Resolvers using `${customProviderName:customResolverName:key}` syntax.

**You can always reference the default Resolvers provided by Providers, even if you don’t define them explicitly.**
For example,
you can reference the default `s3` Resolver provided by the `aws` Provider using `${aws:s3:myBucket/myKey}` syntax
(it will use the AWS provider which provides the credentials for the deployment),
or `${customProviderName:s3:myBucket/myKey}` if you define customized Provider configuration.

### Examples

#### Default Resolvers

```yaml
functions:
  hello:
    handler: handler.hello
    environment:
      ACCOUNT_ID: ${aws:accountId} # built-in variable provided by the AWS provider
      SSM_VALUE: ${aws:ssm:/path/to/param} # uses the default resolver configuration and the same AWS provider which is used for the deployment
      S3_VALUE: ${aws:s3:myBucket/myKey} # uses the default resolver configuration and the same AWS provider which is used for the deployment
```

#### Customized Resolvers

```yaml
stages:
  default:
    resolvers:
      awsAccount1:
        type: aws
        profile: dev-account1-profile-name
      awsAccount2:
        type: aws
        profile: dev-account2-profile-name
        euS3: # custom resolver configuration defined for the awsAccount2 provider
          type: s3
          region: eu-west-1
  prod:
    resolvers:
      awsAccount1:
        type: aws
        profile: prod-account1-profile-name
      awsAccount2:
        type: aws
        profile: prod-account2-profile-name
        euS3: # custom resolver configuration defined for the awsAccount2 provider
          type: s3
          region: eu-west-1

functions:
  hello:
    handler: handler.hello
    environment:
      ACCOUNT1_ID: ${awsAccount1:accountId} # built-in variable provided by the AWS provider
      SSM_VALUE: ${awsAccount1:ssm:/path/to/param} # uses the default resolver configuration even if it's not explicitly defined in the resolvers block
      EU_S3_VALUE: ${awsAccount2:euS3:myBucket/myKey} # uses the customized resolver configuration
      S3_VALUE: ${awsAccount2:s3:myBucket/myKey} # uses the default resolver configuration even if a customized one (euS3) is defined for the same provider
```

## Supported Variable Providers:

- [Self-References Properties Defined in `serverless.yml`](./self)
- [Serverless Core Variables](./core)
- [Environment Variables](./env-vars)
- [CLI Options](./cli-options)
- [External YAML/JSON Files](./file)
- [Dynamic Values from Javascript](./javascript)
- [Git](./git)
- [AWS](./aws)
- [HashiCorp](./hashicorp)

## Recursively reference properties

You can also **recursively reference properties** with the variable system. This means you can combine multiple values and variable sources for a lot of flexibility.

For example:

```yml
provider:
  name: aws
  environment:
    MY_SECRET: ${file(./config.${sls:stage}.json):CREDS}
```

If `sls deploy --stage qa` is run, the stage will be set to `qa`, which is used inside the `${file(./config.${sls:stage}.json):CREDS}` variable and it will resolve the `config.qa.json` file and use the `CREDS` key defined.

**How that works:**

1. `stage` is set to `qa` from the option supplied to the `sls deploy --stage qa` command. If no option is defined, then `${sls:stage}` will use the value in `provider.stage` or default to `dev` if not set.
2. `${sls:stage}` resolves to `qa` and is used in `${file(./config.${sls:stage}.json):CREDS}`
3. `${file(./config.qa.json):CREDS}` is found & the `CREDS` value is read
4. `MY_SECRET` value is set

Likewise, if `sls deploy --stage prod` is run the `config.prod.json` file would be found and used.

## Setting Variables using Parameters

Occasionally you may want to set a variable directly in the `serverless.yml` that you can use throughout the file. In such a case you can use Parameters to set new variables or use them to set stage-specific variables.

Here is an example of setting a domain variable based on the stage:

```yaml
stages:
  default:
    params:
      domain: ${sls:stage}.example-dev.com
  prod:
    params:
      domain: example.com

provider:
  environment:
    APP_DOMAIN: ${param:domain}
```

Read all about parameters in the [Parameters documentation](../../guides/parameters.md).

## Multiple Configuration Files

Adding many custom resources to your `serverless.yml` file could bloat the whole file, so you can use the Serverless Variable syntax to split this up.

```yml
resources:
  Resources: ${file(cloudformation-resources.json)}
```

The corresponding resources which are defined inside the `cloudformation-resources.json` file will be resolved and loaded into the `Resources` section.

In order to use multiple resource files combined with resources inside the `serverless.yml` you can use an array.

```yml
resources:
  - Resources:
      ApiGatewayRestApi:
        Type: AWS::ApiGateway::RestApi

  - ${file(resources/first-cf-resources.yml)}
  - ${file(resources/second-cf-resources.yml)}

  - Outputs:
      CognitoUserPoolId:
      Value:
        Ref: CognitoUserPool
```

Each of your cloudformation files has to start with a `Resources` entity

```yml
Resources:
  Type: 'AWS::S3::Bucket'
  Properties:
    BucketName: some-bucket-name
```

## Default values

The Serverless framework gives you an intuitive way to reference multiple variables as a fallback strategy in case one of the variables is missing. This way you'll be able to use a default value from a certain source, if the variable from another source is missing.

For example, you can use the `opt` variable to get the `memory` CLI option when running `serverless deploy --memory 2048`. If the `memory` option is not provided, the default value of `1024` will be used.

```yml
functions:
  hello:
    handler: handler.hello
    memorySize: ${opt:memory, 1024}
```

The default value can also reference another variable.

## Read String Variable Values as Boolean Values

In some cases, a parameter expect a `true` or `false` boolean value. If you are using a variable to define the value, it may return as a string (e.g. when using SSM variables) and thus return a `"true"` or `"false"` string value.

To ensure a boolean value is returned, read the string variable value as a boolean value. For example:

```yml
provider:
  tracing:
    apiGateway: ${strToBool(${ssm:API_GW_DEBUG_ENABLED})}
```

These are examples that explain how the conversion works after first lowercasing the passed string value:

```plaintext
${strToBool(true)} => true
${strToBool(false)} => false
${strToBool(True)} => true
${strToBool(False)} => false
${strToBool(TRUE)} => true
${strToBool(FALSE)} => false
${strToBool(0)} => false
${strToBool(1)} => true
${strToBool(2)} => Error
${strToBool(null)} => Error
${strToBool(anything)} => Error
```
