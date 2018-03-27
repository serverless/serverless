<!--
title: Serverless Framework - Apache OpenWhisk Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure Apache OpenWhisk functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/functions)
<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Functions

If you are using OpenWhisk as a provider, all *functions* inside the service are OpenWhisk Actions.

## Configuration

All of the OpenWhisk Actions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: myService

provider:
  name: openwhisk
  runtime: nodejs:6 # optional, default is nodejs:default
  memory: 512 # optional, default is 256
  timeout: 30 # optional, default is 60

functions:
  hello:
    handler: handler.hello # required, handler set in Apache OpenWhisk
    name: some_custom_name # optional, default is ${service}_${function}
    runtime: nodejs # optional overwrite, default is provider runtime
    memory: 512 # optional overwrite, default is 256
    timeout: 10 # optional overwrite, default is 60
    parameters:
      foo: bar // default parameters
```

The `handler` property points to the file and module containing the code you want to run in your function.

```javascript
// handler.js
exports.handler = function(params) {}
```

You can add as many functions as you want within this property.

```yml
# serverless.yml

service: myService

provider:
  name: openwhisk

functions:
  functionOne:
    handler: handler.functionOne
    description: optional description for your Action
  functionTwo:
    handler: handler.functionTwo
  functionThree:
    handler: handler.functionThree
```

Your functions can either inherit their settings from the `provider` property.

```yml
# serverless.yml
service: myService

provider:
  name: openwhisk
  runtime: nodejs:6
  memory: 512 # will be inherited by all functions

functions:
  functionOne:
    handler: handler.functionOne
```

Or you can specify properties at the function level.

```yml
# serverless.yml
service: myService

provider:
  name: openwhisk
  runtime: nodejs:6

functions:
  functionOne:
    handler: handler.functionOne
    memory: 512 # function specific
    parameters:
      foo: bar // default parameters
```

## Packages

OpenWhisk provides a concept called "packages" to manage related actions. Packages can contain multiple actions under a common identifier in a namespace. Configuration values needed by all actions in a package can be set as default properties on the package, rather than individually on each action.

*Packages are identified using the following format:* `/namespaceName/packageName/actionName`.

### Implicit Packages

Functions can be assigned to packages by setting the function `name` with a package reference.

```yaml
functions:
  foo:
    handler: handler.foo
    name: "myPackage/foo"
  bar:
    handler: handler.bar
    name: "myPackage/bar"
```

In this example, two new actions (`foo` & `bar`) will be created using the `myPackage` package.

Packages which do not exist will be automatically created during deployments. When using the `remove` command, any packages referenced in the `serverless.yml` will be deleted.

### Explicit Packages

Packages can also be defined explicitly to set shared configuration parameters. Default package parameters are merged into event parameters for each invocation.

```yaml
functions:
  foo:
    handler: handler.foo
    name: "myPackage/foo"
    
resources:
  packages:
    myPackage:
      parameters:
        hello: world 
```

*Explicit packages support the following properties: `parameters`, `annotations` and `shared`.*

## Runtimes

The OpenWhisk provider plugin supports the following runtimes.

- Node.js
- Python
- Php
- Swift
- Binary
- Docker

Please see the following repository for sample projects using those runtimes.

[https://github.com/serverless/examples/](https://github.com/serverless/examples/)
