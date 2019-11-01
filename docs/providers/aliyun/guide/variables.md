<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Serverless Variables
menuText: Variables
menuOrder: 10
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/variables)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Variables

The Serverless framework provides a powerful variable system which allows you to add dynamic data into your `serverless.yml`. With Serverless Variables, you'll be able to do the following:

- Reference & load variables from environment variables
- Reference & load variables from CLI options
- Recursively reference properties of any type from the same `serverless.yml` file
- Recursively reference properties of any type from other YAML / JSON files
- Recursively nest variable references within each other for ultimate flexibility
- Combine multiple variable references to overwrite each other

**Note:** You can only use variables in `serverless.yml` property **values**, not property keys. So you can't use variables to generate dynamic logical IDs in the custom resources section for example.

## Reference variables from environment variables

To reference variables from environment variables, use the `${env:someProperty}` syntax in your `serverless.yml`.

```yml
service: new-service

provider:
  name: aliyun
  runtime: nodejs8
  credentials: ~/.aliyuncli/credentials # path must be absolute

plugins:
  - serverless-aliyun-function-compute

functions:
  ossTriggerTest:
    handler: index.ossTriggerHandler
    events:
      - oss:
          sourceArn: acs:oss:cn-shanghai:${env:ALIYUN_ACCOUNT}:my-service-resource
          triggerConfig:
            events:
              - oss:ObjectCreated:PostObject
              - oss:ObjectCreated:PutObject
            filter:
              key:
                prefix: source/
```

## Reference Properties In serverless.yml

To self-reference properties in `serverless.yml`, use the `${self:someProperty}` syntax in your `serverless.yml`. This functionality is recursive, so you can go as deep in the object tree as you want.

```yml
service: new-service

provider:
  name: aliyun
  runtime: nodejs8
  credentials: ~/.aliyuncli/credentials # path must be absolute

plugins:
  - serverless-aliyun-function-compute

functions:
  first:
    handler: index.first
    events:
      - http:
          path: ${self:custom.path}
          method: get

  second:
    handler: index.second
    events:
      - http:
          path: ${self:custom.path}
          method: post
```

In the above example you're setting a global event resource for all functions by referencing the `resource` property in the same `serverless.yml` file. This way, you can easily change the event resource for all functions whenever you like.

## Reference Variables in JavaScript Files

To add dynamic data into your variables, reference javascript files by putting `${file(./myFile.js):someModule}` syntax in your `serverless.yml`. Here's an example:

```javascript
// myCustomFile.js
module.exports.path = () => {
  // Code that generates dynamic data
  return '/quo/foo/bar';
};
```

```yml
# serverless.yml
service: new-service

provider:
  name: aliyun
  runtime: nodejs8
  credentials: ~/.aliyuncli/credentials # path must be absolute

plugins:
  - serverless-aliyun-function-compute

functions:
  first:
    handler: index.first
    events:
      - http:
          path: ${file(./myCustomFile.js):path} # Reference a specific module
          method: get
```

You can also return an object and reference a specific property. Just make sure you are returning a valid object and referencing a valid property:

```javascript
// myCustomFile.js
module.exports.paths = () => {
  // Code that generates dynamic data
  return {
    current: '/quo/foo/bar',
  };
};
```

```yml
# serverless.yml
service: new-service

provider:
  name: aliyun
  runtime: nodejs8
  credentials: ~/.aliyuncli/credentials # path must be absolute

plugins:
  - serverless-aliyun-function-compute

functions:
  first:
    handler: index.first
    events:
      - http:
          path: ${file(./myCustomFile.js):paths.current} # Reference a specific module
          method: get
```

## Multiple Configuration Files

Adding many custom resources to your `serverless.yml` file could bloat the whole file, so you can use the Serverless Variable syntax to split this up.

```yml
resources:
  Resources: ${file(aliyun-cloud-resources.json)}
```

The corresponding resources which are defined inside the `aliyun-cloud-resources.json` file will be resolved and loaded into the `Resources` section.
