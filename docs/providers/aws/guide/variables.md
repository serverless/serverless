<!--
title: Serverless Variables
menuText: Variables
menuOrder: 11
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/variables)

<!-- DOCS-SITE-LINK:END -->

# Variables

Variables allow users to dynamically replace config values in `serverless.yml` config.

They are especially useful when providing secrets for your service to use and when you are working with multiple stages.

If `unresolvedVariablesNotificationMode` is set to `error`, references to variables that cannot be resolved will result in an error being thrown.
This will become the default behaviour in the next major version.

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

- [Serverless Core variables](#referencing-serverless-core-variables)
- [Environment variables](#referencing-environment-variables)
- [CLI options](#referencing-cli-options)
- [Other properties defined in `serverless.yml`](#reference-properties-in-serverlessyml)
- [External YAML/JSON files](#reference-properties-in-other-files)
- [Variables from S3](#referencing-s3-objects)
- [Variables from AWS SSM Parameter Store](#reference-variables-using-the-ssm-parameter-store)
- [Variables from AWS Secrets Manager](#reference-variables-using-aws-secrets-manager)
- [CloudFormation stack outputs](#reference-cloudformation-outputs)
- [Properties exported from Javascript files (sync or async)](#reference-variables-in-javascript-files)
- [Read String Variable Values as Boolean Values](#read-string-variable-values-as-boolean-values)
- [Pseudo Parameters Reference](#aws-cloudformation-pseudo-parameters-and-intrinsic-functions)

## Casting string variables to boolean values

## Recursively reference properties

You can also **Recursively reference properties** with the variable system. This means you can combine multiple values and variable sources for a lot of flexibility.

For example:

```yml
provider:
  name: aws
  environment:
    MY_SECRET: ${file(./config.${opt:stage, 'dev'}.json):CREDS}
```

If `sls deploy --stage qa` is run, the option `stage=qa` is used inside the `${file(./config.${opt:stage, 'dev'}.json):CREDS}` variable and it will resolve the `config.qa.json` file and use the `CREDS` key defined.

**How that works:**

1. stage is set to `qa` from the option supplied to the `sls deploy --stage qa` command
2. `${opt:stage, 'dev'}` resolves to `qa` and is used in `${file(./config.${opt:stage, 'dev'}.json):CREDS}`
3. `${file(./config.qa.json):CREDS}` is found & the `CREDS` value is read
4. `MY_SECRET` value is set

Likewise, if `sls deploy --stage prod` is run the `config.prod.json` file would be found and used.

If no `--stage` flag is provided, the fallback `dev` will be used and result in `${file(./config.dev.json):CREDS}`.

## Reference Properties In serverless.yml

To self-reference properties in `serverless.yml`, use the `${self:someProperty}` syntax in your `serverless.yml`. `someProperty` can contain the empty string for a top-level self-reference or a dotted attribute reference to any depth of attribute, so you can go as shallow or deep in the object tree as you want.

```yml
service: new-service
provider: aws
custom:
  globalSchedule: rate(10 minutes)
  newService: ${self:}
  # the following will resolve identically in other serverless.yml files so long as they define
  # `custom.newService: ${file(<relative-path-to-this-file>/serverless.yml)}`
  exportName: ${self:custom.newService.service}-export

functions:
  hello:
    handler: handler.hello
    events:
      - schedule: ${self:custom.globalSchedule}
  world:
    handler: handler.world
    events:
      - schedule: ${self:custom.globalSchedule}
resources:
  Outputs:
    NewServiceExport:
      Value: 'A Value To Export'
      Export:
        Name: ${self:custom.exportName}
```

In the above example you're setting a global schedule for all functions by referencing the `globalSchedule` property in the same `serverless.yml` file. This way, you can easily change the schedule for all functions whenever you like.

## Referencing Serverless Core Variables

Serverless initializes core variables which are used internally by the Framework itself. Those values are exposed via the Serverless Variables system and can be re-used with the `{sls:}` variable prefix.

The following variables are available:

**instanceId**

A random id which will be generated whenever the Serverless CLI is run. This value can be used when predictable random variables are required.

```yml
service: new-service
provider: aws

functions:
  func1:
    name: function-1
    handler: handler.func1
    environment:
      APIG_DEPLOYMENT_ID: ApiGatewayDeployment${sls:instanceId}
```

**stage**

The stage used by the Serverless CLI. The `${sls:stage}` variable is a shortcut for `${opt:stage, self:provider.stage, "dev"}`.

## Referencing Environment Variables

To reference environment variables, use the `${env:SOME_VAR}` syntax in your `serverless.yml` configuration file. It is valid to use the empty string in place of `SOME_VAR`. This looks like "`${env:}`" and the result of declaring this in your `serverless.yml` is to embed the complete `process.env` object (i.e. all the variables defined in your environment).

**Note:**

Keep in mind that sensitive information which is provided through environment variables can be written into less protected or publicly accessible build logs, CloudFormation templates, et cetera.

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${env:FUNC_PREFIX}-hello
    handler: handler.hello
  world:
    name: ${env:FUNC_PREFIX}-world
    handler: handler.world
```

In the above example you're dynamically adding a prefix to the function names by referencing the `FUNC_PREFIX` env var. So you can easily change that prefix for all functions by changing the `FUNC_PREFIX` env var.

## Referencing CLI Options

To reference CLI options that you passed, use the `${opt:<option>}` syntax in your `serverless.yml` configuration file. It is valid to use the empty string in place of `<option>`. This looks like "`${opt:}`" and the result of declaring this in your `serverless.yml` is to embed the complete `options` object (i.e. all the command line options from your `serverless` command).

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${opt:stage}-hello
    handler: handler.hello
  world:
    name: ${opt:stage}-world
    handler: handler.world
```

In the above example, you're dynamically adding a prefix to the function names by referencing the `stage` option that you pass in the CLI when you run `serverless deploy --stage dev`. So when you deploy, the function name will always include the stage you're deploying to.

## Reference CloudFormation Outputs

You can reference CloudFormation stack output values as the source of your variables to use in your service with the `cf:stackName.outputKey` syntax. For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${cf:another-service-dev.functionPrefix}-hello
    handler: handler.hello
  world:
    name: ${cf:another-stack.functionPrefix}-world
    handler: handler.world
```

In that case, the framework will fetch the values of those `functionPrefix` outputs from the provided stack names and populate your variables. There are many use cases for this functionality and it allows your service to communicate with other services/stacks.

You can add such custom output to CloudFormation stack. For example:

```yml
service: another-service
provider:
  name: aws
  runtime: nodejs12.x
  region: ap-northeast-1
  memorySize: 512
functions:
  hello:
    name: ${self:custom.functionPrefix}hello
    handler: handler.hello
custom:
  functionPrefix: 'my-prefix-'
resources:
  Outputs:
    functionPrefix:
      Value: ${self:custom.functionPrefix}
      Export:
        Name: functionPrefix
    memorySize:
      Value: ${self:provider.memorySize}
      Export:
        Name: memorySize
```

You can also reference CloudFormation stack in another regions with the `cf(REGION):stackName.outputKey` syntax. For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${cf(us-west-2):another-service-dev.functionPrefix}-hello
    handler: handler.hello
  world:
    name: ${cf(ap-northeast-1):another-stack.functionPrefix}-world
    handler: handler.world
```

You can reference [CloudFormation stack outputs export values](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) as well. For example:

```yml
# Make sure you set export value in StackA.

  Outputs:
    DynamoDbTable:
      Value:
        "Ref": DynamoDbTable
      Export:
        Name: DynamoDbTable-${self:custom.stage}

# Then you can reference the export name in StackB

provider:
  environment:
    Table:
        'Fn::ImportValue': 'DynamoDbTable-${self:custom.stage}'
```

## Referencing S3 Objects

You can reference S3 values as the source of your variables to use in your service with the `s3:bucketName/key` syntax. For example:

```yml
service: new-service
provider: aws
functions:
  hello:
    name: ${s3:myBucket/myKey}-hello
    handler: handler.hello
```

In the above example, the value for `myKey` in the `myBucket` S3 bucket will be looked up and used to populate the variable.
Buckets from all regions can be used without any additional specification due to AWS S3 global strategy.

## Reference Variables using the SSM Parameter Store

_Note: Ensure to add `variablesResolutionMode: 20210326` to your service configuration, to enable complete support for "ssm" variables resolution._

You can reference SSM Parameters as the source of your variables with the `ssm:/path/to/param` syntax. For example:

```yml
service: ${ssm:/path/to/service/id}-service
variablesResolutionMode: 20210326
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
variablesResolutionMode: 20210326
provider:
  name: aws
functions:
  hello:
    name: ${ssm(ap-northeast-1):/path/to/service/myParam}-hello
    handler: handler.hello
```

## Referencing AWS-specific variables

You can reference AWS-specific values as the source of your variables. Those values are exposed via the Serverless Variables system through the `{aws:}` variable prefix.

The following variables are available:

**accountId**

Account ID of you AWS Account, based on the AWS Credentials that you have configured.

```yml
service: new-service
provider:
  name: aws

functions:
  func1:
    name: function-1
    handler: handler.func1
    environment:
      ACCOUNT_ID: ${aws:accountId}
```

**region**

The region used by the Serverless CLI. The `${aws:region}` variable is a shortcut for `${opt:region, self:provider.region, "us-east-1"}`.

### Resolution of non plain string types

New variable resolver, ensures that automatically other types as `SecureString` and `StringList` are resolved into expected forms.

#### Auto decrypting of `SecureString` type parameters.

All `SecureString` type parameters are automatically decrypted, and automatically parsed if they export stringified JSON content (Note: you can turn off parsing by passing `raw` instruction into variable as: `${ssm(raw):/path/to/secureparam}`, if you need to also pass custom region, put it first as: `${ssm(eu-west-1, raw):/path/to/secureparam}`)

## Reference Variables using AWS Secrets Manager

Variables in [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) can be referenced [using SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/integration-ps-secretsmanager.html), just use the `ssm:/aws/reference/secretsmanager/secret_ID_in_Secrets_Manager` syntax. For example:

```yml
service: new-service
variablesResolutionMode: 20210326
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
variablesResolutionMode: 20210326
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

#### Resolve `StringList` as array of strings

Same `StringList` type parameters are automatically detected and resolved to array form. (Note: you can turn off resolution to array by passing `raw` instruction into variable as: `${ssm(raw):/path/to/stringlistparam}`, if you need to also pass custom region, put it first as: `${ssm(eu-west-1, raw):/path/to/stringlistparam}`)

```yml
service: new-service
variablesResolutionMode: 20210326
provider: aws
functions:
  hello:
    name: hello
    handler: handler.hello
custom:
  myArrayVar: ${ssm:/path/to/stringlistparam}
```

## Reference Properties in Other Files

You can reference properties in other YAML or JSON files. To reference properties in other YAML files use the `${file(./myFile.yml):someProperty}` syntax in your `serverless.yml` configuration file.

Files need to be referenced by relative paths, which should not reach out beyond project directory (by default service directory). If you work with multi-service project, you can change project directory boundary with `projectDir` setting (e.g. set `projectDir: ../` if you're service is nested in top level _service-x_ directory)

To reference properties in other JSON files use the `${file(./myFile.json):someProperty}` syntax. It is important that the file you are referencing has the correct suffix, or file extension, for its file type (`.yml` for YAML or `.json` for JSON) in order for it to be interpreted correctly.

Here's an example:

```yml
# myCustomFile.yml
globalSchedule: rate(10 minutes)
```

```yml
# serverless.yml
service: new-service
provider: aws
custom: ${file(./myCustomFile.yml)} # You can reference the entire file
functions:
  hello:
    handler: handler.hello
    events:
      - schedule: ${file(./myCustomFile.yml):globalSchedule} # Or you can reference a specific property
  world:
    handler: handler.world
    events:
      - schedule: ${self:custom.globalSchedule} # This would also work in this case
```

In the above example, you're referencing the entire `myCustomFile.yml` file in the `custom` property. You need to pass the path relative to your service directory. You can also request specific properties in that file as shown in the `schedule` property. It's completely recursive and you can go as deep as you want. Additionally you can request properties that contain arrays from either YAML or JSON reference files. Here's a YAML example for an events array:

```yml
myevents:
  - schedule:
      rate: rate(1 minute)
```

and for JSON:

```json
{
  "myevents": [
    {
      "schedule": {
        "rate": "rate(1 minute)"
      }
    }
  ]
}
```

In your `serverless.yml`, depending on the type of your source file, either have the following syntax for YAML:

```yml
functions:
  hello:
    handler: handler.hello
    events: ${file(./myCustomFile.yml):myevents}
```

or for a JSON reference file use this syntax:

```yml
functions:
  hello:
    handler: handler.hello
    events: ${file(./myCustomFile.json):myevents}
```

**Note:** If the referenced file is a symlink, the targeted file will be read.

## Reference Variables in Javascript Files

You can reference JavaScript modules to add dynamic data into your variables.

### Exporting an object

To rely on exported `someModule` property in `myFile.js` you'd use the following code `${file(./myFile.js):someModule}`)

e.g.

```js
// scheduleConfig.js
module.exports.rate = 'rate(10 minutes)';
```

```yml
# serverless.yml
service: new-service
provider: aws

functions:
  hello:
    handler: handler.hello
    events:
      - schedule: ${file(./scheduleConfig.js):rate} # Reference a specific module
```

### Exporting a function

#### With a new variables resolver

_Note: works only with `variablesResolutionMode: 20210326` set in service configuration_

With a new variables resolver (_which will be the only used resolver in v3 of a Framework_) functions receives an object, with following properties:

- `options` - An object referencing resolved CLI params as passed to the command
- `resolveVariable(variableString)` - Async function which resolves provided variable string. String should be passed without wrapping (`${` and `}`) braces. Example valid values:
  - `file(./config.js):SOME_VALUE`
  - `env:SOME_ENV_VAR, null` (end with `, null`, if missing value at the variable source should be resolved with `null`, and not with a thrown error)
- `resolveConfigurationProperty([key1, key2, ...keyN])` - Async function which resolves specific service configuration property. It returns a fully resolved value of configuration property. If circular reference is detected resolution will be rejected.

Resolver function can be either _sync_ or _async_. Still both `resolveConfigurationProperty` and `resolveVariable` utils provided to it are _async_, so if there's an intention to rely on it naturally resolver function should be _async_.

Example on how to obtain some Serverless Framework configuration values:

```js
// config.js (when relying on new variables resolver)
module.exports = async ({ options, resolveVariable }) => {
  const stage = await resolveVariable('sls:stage');
  const region = await resolveVariable('opt:region, self:provider.region, "us-east-1"');
  ...

  // Resolver may return any JSON value (null, boolean, string, number, array or plain object)
  return {
    prop1: someValue // if we want to directly access this value, variable should be constructed as ${file(./config):prop1}
    prop2: someOther value
  }
}
```

#### With a legacy (deprecated) resolver

In old legacy resolver (deprecated, but still default in v2) function receives a reference to the Serverless object containing your configuration.

_**Notice:** Configuration is yet in unresolved state, so any properties configured with variables may still be presented with variables in it_

```js
// config.js (when relying on legacy resolver)
module.exports = (serverless) => {
  serverless.cli.consoleLog('You can access Serverless config at serverless.configrationInput');

  return {
    property1: 'some value',
    property2: 'some other value',
  };
};
```

```yml
# serverless.yml
service: new-service
provider: aws

custom: ${file(./config.js)}
```

You can also return an object and reference a specific property. Just make sure you are returning a valid object and referencing a valid property:

```yml
# serverless.yml
service: new-service
provider: aws
functions:
  scheduledFunction:
    handler: handler.scheduledFunction
    events:
      - schedule: ${file(./myCustomFile.js):schedule.ten}
```

```js
// myCustomFile.js
module.exports.schedule = () => {
  // Code that generates dynamic data
  return {
    ten: 'rate(10 minutes)',
    twenty: 'rate(20 minutes)',
    thirty: 'rate(30 minutes)',
  };
};
```

If your use case requires handling dynamic/async data sources (ie. DynamoDB, API calls...etc), you can also return a Promise that would be resolved as the value of the variable:

```yml
# serverless.yml
service: new-service
provider: aws
functions:
  scheduledFunction:
    handler: handler.scheduledFunction
    events:
      - schedule: ${file(./myCustomFile.js):promised}
```

```js
// myCustomFile.js
module.exports.promised = () => {
  // Async code that fetches the rate config...
  return Promise.resolve('rate(10 minutes)');
};
```

For example, in such helper you could call AWS SDK to get account details:

```js
// myCustomFile.js
const { STS } = require('aws-sdk');
const sts = new STS();

module.exports.getAccountId = async () => {
  // Checking AWS user details
  const { Account } = await sts.getCallerIdentity().promise();
  return Account;
};
```

```yml
# serverless.yml
service: new-service
provider: aws
custom:
  accountId: ${file(./myCustomFile.js):getAccountId}
```

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

## Nesting Variable References

The Serverless variable system allows you to nest variable references within each other for ultimate flexibility. So you can reference certain variables based on other variables. Here's an example:

```yml
service: new-service
provider: aws
custom:
  myFlexibleArn: ${env:${opt:stage}_arn}

functions:
  hello:
    handler: handler.hello
```

In the above example, if you pass `dev` as a stage option, the framework will look for the `dev_arn` environment variable. If you pass `production`, the framework will look for `production_arn`, and so on. This allows you to creatively use multiple variables by using a certain naming pattern without having to update the values of these variables constantly. You can go as deep as you want in your nesting, and can reference variables at any level of nesting from any source (env, opt, self or file).

## Overwriting Variables

The Serverless framework gives you an intuitive way to reference multiple variables as a fallback strategy in case one of the variables is missing. This way you'll be able to use a default value from a certain source, if the variable from another source is missing.

For example, if you want to reference the stage you're deploying to, but you don't want to keep on providing the `stage` option in the CLI. What you can do in `serverless.yml` is:

```yml
service: new-service
provider:
  name: aws
  stage: dev
custom:
  myStage: ${opt:stage, self:provider.stage}
  myRegion: ${opt:region, 'us-west-1'}
  myCfnRole: ${opt:role, false}
  myLambdaMemory: ${opt:memory, 1024}

functions:
  hello:
    handler: handler.hello
```

What this says is to use the `stage` CLI option if it exists, if not, use the default stage (which lives in `provider.stage`). So during development you can safely deploy with `serverless deploy`, but during production you can do `serverless deploy --stage production` and the stage will be picked up for you without having to make any changes to `serverless.yml`.

You can have as many variable references as you want, from any source you want, and each of them can be of different type and different name.

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

## AWS CloudFormation Pseudo Parameters and Intrinsic functions

[AWS Pseudo Parameters](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/pseudo-parameter-reference.html)
can be used in values which are passed through as is to CloudFormation template properties.

Otherwise Serverless Framework has no implied understanding of them and does not try to resolve them on its own.

Same handling applies to [CloudFormation Intrinsic functions](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference.html)
