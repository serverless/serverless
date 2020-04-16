<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Functions | Serverless Framework
menuText: Functions
menuOrder: 5
description: How to configure Tencent Cloud's Serverless Cloud Functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/guide/functions/)

<!-- DOCS-SITE-LINK:END -->

# Tencent-SCF - Functions

If you are using Tencent as a provider, all _functions_ inside the service are Tencent Serverless Cloud Functions.

## Configuration

All of the functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
service: myService # service name

provider: # provider information
  name: tencent
  runtime: Nodejs8.9
  credentials: ~/credentials

# you can overwrite defaults here
#  stage: dev
#  cosBucket: DEFAULT
#  role: QCS_SCFExcuteRole
#  memorySize: 256
#  timeout: 10
#  region: ap-shanghai
#  environment:
#    variables:
#      ENV_FIRST: env1
#      ENV_SECOND: env2

plugins:
  - serverless-tencent-scf

functions:
  hello_world:
    handler: index.main_handler
    #   description: Tencent Serverless Cloud Function
    runtime: Nodejs8.9
#    memorySilsze: 256
#    timeout: 10
#    environment:
#      variables:
#        ENV_FIRST: env1
#        ENV_Third: env2
```

The `handler` property points to the file and module containing the code you want to run in your function.

```javascript
// index.js
exports.main_handler = async (event, context, callback) => {};
```

You can add as many functions as you want within this property.

```yml
# serverless.yml

service: myService # service name

provider: # provider information
  name: tencent
  runtime: Nodejs8.9
  credentials: ~/credentials

functions:
  functionOne:
    handler: handler.functionOne
    description: optional description for your function
  functionTwo:
    handler: handler.functionTwo
  functionThree:
    handler: handler.functionThree
```

Your functions can either inherit their settings from the `provider` property.

```yml
# serverless.yml
service: myService

provider: # provider information
  name: tencent
  runtime: Nodejs8.9
  memorySize: 512 # will be inherited by all functions

functions:
  functionOne:
    handler: handler.functionOne
```

Or you can specify properties at the function level.

```yml
# serverless.yml
service: myService

provider: # provider information
  name: tencent
  runtime: Nodejs8.9

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512 # function specific
```

You can specify an array of functions, which is useful if you separate your functions in to different files:

```yml
# serverless.yml
---
functions:
  - ${file(./foo-functions.yml)}
  - ${file(./bar-functions.yml)}
```

```yml
# foo-functions.yml
getFoo:
  handler: handler.foo
deleteFoo:
  handler: handler.foo
```

## Permissions

Every Tencent Serverless Cloud Function needs permission to interact with other Tencent infrastructure resources within your account. These permissions are set via an CAM Role. You can set permission policy statements within this role via the `provider.role` property.

```yml
# serverless.yml
service: myService

provider: # provider information
  name: tencent
  runtime: Nodejs8.9
  credentials: ~/credentials
  role: QCS_SCFExcuteRole # SCF default role to interact with other services.

functions:
  functionOne:
    handler: handler.functionOne
    memorySize: 512
```

The executing role `QCS_SCFExcuteRole` is used to grant the function code permissions to read and operate resources during execution.

Currently, this role has the following policies:

- QcloudSCFFullAccess
- QcloudCLSFullAccess

`QcloudSCFFullAccess` is used to allow the code to access and call other functions under the same account during execution.
`QcloudCLSFullAccess` is used to write a function execution log to CLS when the function is executed.

## Environment Variables

You can add environment variable configuration to a specific function in `serverless.yml` by adding an `environment` object property in the function configuration. This object should contain a key-value pairs of string to string:

```yml
# serverless.yml
service: myService
provider:
  name: tencent

functions:
  hello:
    handler: handler.hello
    environment:
      TABLE_NAME: tableName
```

Or if you want to apply environment variable configuration to all functions in your service, you can add the configuration to the higher level `provider` object. Environment variables configured at the function level are merged with those at the provider level, so your function with specific environment variables will also have access to the environment variables defined at the provider level. If an environment variable with the same key is defined at both the function and provider levels, the function-specific value overrides the provider-level default value. For example:

```yml
# serverless.yml
service: myService
provider:
  name: tencent
  environment:
    SYSTEM_NAME: mySystem
    TABLE_NAME: tableName1

functions:
  hello:
    # this function will have SYSTEM_NAME=mySystem and TABLE_NAME=tableName1 from the provider-level environment config above
    handler: handler.hello
  users:
    # this function will have SYSTEM_NAME=mySystem from the provider-level environment config above
    # but TABLE_NAME will be tableName2 because this more specific config will override the default above
    handler: handler.users
    environment:
      TABLE_NAME: tableName2
```

Check out the [Environment Variables](./variables.md) for all the details and options.
