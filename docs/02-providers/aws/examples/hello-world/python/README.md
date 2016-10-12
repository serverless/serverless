<!--
title: Hello World AWS Lambda Python Example
menuText: Hello World Python Example
description: Create a simple Python powered Lambda function on amazon web services
layout: Doc
-->

# Hello World in Python

Make sure `serverless` is installed. [See installation guide](/docs/01-guide/01-installing-serverless.md)

## 1. Deploy

`serverless deploy` or `sls deploy`. `sls` is shorthand for the serverless CLI command

## 2. Invoke deployed function

`serverless invoke --function helloWorld` or `serverless invoke -f helloWorld`

`-f` is shorthand for `--function`

In your terminal window you should be the response from AWS Lambda

```bash
{
  "message": "Hello World"
}
```

Congrats you have just deployed and ran your hello world function!
