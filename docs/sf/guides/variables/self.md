<!--
title: Serverless Framework - Variables - serverless.yml self-reference
description: How to self-reference variables in serverless.yml
short_title: Serverless Variables - Self-reference serverless.yml
keywords:
  ['Serverless Framework', 'serverless.yml', 'Variables', 'Self-reference']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/self)

<!-- DOCS-SITE-LINK:END -->

# Self-Reference Properties in serverless.yml

To self-reference properties in `serverless.yml`, use the `${self:someProperty}` syntax in your `serverless.yml`. `someProperty` can contain the empty string for a top-level self-reference or a dotted attribute reference to any depth of attribute, so you can go as shallow or deep in the object tree as you want.

```yml
service: new-service
provider: aws
custom:
  globalSchedule: rate(10 minutes)
  # the following example purposely demonstrates the ability for a variable to cross reference another one
  serviceName: ${self:service}
  exportName: ${self:custom.serviceName}-export
  # or simply
  # exportName: ${self:service}-export

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
