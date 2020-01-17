<!--
title: Hello World Java Example
menuText: Hello World Java Example
description: Create a Java Hello World OpenWhisk function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/examples/hello-world/java/)

<!-- DOCS-SITE-LINK:END -->

# Hello World Java Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

## 1. Create a service

`serverless create --template openwhisk-java-maven --path myService` or `sls create --template openwhisk-java-maven --path myService`, where 'myService' is a new folder to be created with template service files. Change directories into this new folder.

## 2. Install Provider Plugin

`npm install` in the service directory.

## 3. Build Java program

`mvn package` in the service directory.

## 4. Deploy

`serverless deploy` or `sls deploy`. `sls` is shorthand for the Serverless CLI command

## 5. Invoke deployed function

`serverless invoke --function demo` or `serverless invoke -f demo`

`-f` is shorthand for `--function`

In your terminal window you should see the response from Apache OpenWhisk

```bash
{
    "greetings": "Hello! Welcome to OpenWhisk"
}
```

Congrats you have deployed and ran your demo function!
