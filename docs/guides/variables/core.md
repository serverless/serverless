<!--
title: Serverless Framework - Variables - Serverless Core Variables
description: How to reference Serverless Core variables
short_title: Serverless Variables - Core Variables
keywords: ['Serverless Framework', 'Core Variables', 'Configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/core)

<!-- DOCS-SITE-LINK:END -->

# Reference Serverless Core Variables

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
