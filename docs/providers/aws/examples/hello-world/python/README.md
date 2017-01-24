<!--
title: Hello World Python Example
menuText: Hello World Python Example
description: Create a Python Hello World Lambda function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/examples/hello-world/python/)
<!-- DOCS-SITE-LINK:END -->

# Hello World Python Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

## 1. Create a service
`serverless create --template aws-python --path myService` or `sls create --template aws-python --path myService`, where 'myService' is a new folder to be created with template service files.  Change directories into this new folder.

## 2. Deploy
`serverless deploy` or `sls deploy`. `sls` is shorthand for the serverless CLI command

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

Congrats you have just deployed and ran your Hello World function!
