<!--
title: Hello World AWS Lambda Node Example
menuText: Hello World Node Example
description: Create a nodeJS Lambda function on amazon web services
layout: Doc
-->

# Hello World Node.js

Make sure serverless is installed. [See installation guide](/../../01-guide/01-installing-serverless.md)

## 1. Deploy

`serverless deploy` or `sls deploy`. `sls` is shorthand for the serverless CLI command

## 2. Invoke the remote function

`serverless invoke --function hello` or `serverless invoke -f hello`

`-f` is shorthand for `--function`

In your terminal window you should be the response from AWS Lambda

```bash
{
  "message": "Hello World",
  "event": {}
}
```

Congrats you have just deployed and ran your hello world function!
