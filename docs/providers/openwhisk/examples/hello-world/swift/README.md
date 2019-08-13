<!--
title: Hello World Swift Example
menuText: Hello World Swift Example
description: Create a Swift Hello World OpenWhisk function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/examples/hello-world/swift/)

<!-- DOCS-SITE-LINK:END -->

# Hello World Swift Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

## 1. Create a service

`serverless create --template openwhisk-swift --path myService` or `sls create --template openwhisk-swift --path myService`, where 'myService' is a new folder to be created with template service files. Change directories into this new folder.

## 2. Install Provider Plugin

`npm install` in the service directory.

## 3. Deploy

`serverless deploy` or `sls deploy`. `sls` is shorthand for the Serverless CLI command

## 4. Invoke deployed function

`serverless invoke --function helloWorld` or `serverless invoke -f helloWorld`

`-f` is shorthand for `--function`

In your terminal window you should see the response from Apache OpenWhisk

```bash
{
    "payload": "Hello, World!"
}
```

Congrats you have deployed and ran your Hello World function!
