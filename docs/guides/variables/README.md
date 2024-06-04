<!--
title: Serverless Framework - Variables
menuText: Variables
menuOrder: 1
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
layout: Doc
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
yamlKeyXYZ: ${variableSource} # see list of current variable sources below
# this is an example of providing a default value as the second parameter
otherYamlKey: ${variableSource, defaultValue}
```

You can define your own variable syntax (regex) if it conflicts with CloudFormation's syntax.

**Note:** You can only use variables in `serverless.yml` property **values**, not property keys. So you can't use variables to generate dynamic logical IDs in the custom resources section for example.

## Current variable sources:

- [Self-References Properties Defined in `serverless.yml`](/framework/docs/guides/variables/self)
- [Serverless Core Variables](/framework/docs/guides/variables/core)
- [Environment Variables](/framework/docs/guides/variables/env)
- [CLI Options](/framework/docs/guides/variables/cli-options)
- [External YAML/JSON Files](/framework/docs/guides/variables/file)
- [Dynamic Values from Javascript](/framework/docs/guides/variables/javascript)
- [Git](/framework/docs/guides/variables/git)
- [AWS](/framework/docs/guides/variables/aws)
- [AWS S3](/framework/docs/guides/variables/s3)
- [AWS SSM Parameter Store & Secrets Manager](/framework/docs/guides/variables/ssm)
- [AWS CloudFormation Outputs](/framework/docs/guides/variables/cf-stack)

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
    domain: ${sls:stage}.example-dev.com
  prod:
    domain: example.com

provider:
  environment:
    APP_DOMAIN: ${param:domain}
```

Read all about parameters in the [Parameters documentation](/framework/docs/providers/aws/guide/parameters).


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
