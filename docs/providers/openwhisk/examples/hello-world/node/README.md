<!--
title: Hello World Node.js Example
menuText: Hello World Node.js Example
description: Create a Node.js Hello World Lambda function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/examples/hello-world/node/)
<!-- DOCS-SITE-LINK:END -->

# Hello World Node.js Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

## 1. Create a service
`serverless create --template aws-nodejs --path myService` or `sls create --template aws-nodejs --path myService`, where 'myService' is a new folder to be created with template service files.  Change directories into this new folder.

## 2. Deploy
`serverless deploy` or `sls deploy`. `sls` is shorthand for the Serverless CLI command

## 3. Invoke deployed function
`serverless invoke --function hello` or `serverless invoke -f hello`

`-f` is shorthand for `--function`

In your terminal window you should see the response from AWS Lambda

```bash
{
    "statusCode": 200,
    "body": "{\"message\":\"Go Serverless v1.0! Your function executed successfully!\",\"input\":{}}"
}
```

Congrats you have just deployed and run your Hello World function!
