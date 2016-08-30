<!--
title: Hello World AWS Lambda Node Example
description: Create a nodeJS Lambda function on amazon web services
layout: Page
-->

# Hello World Node.js

Make sure serverless is installed. [See installation guide](/link/here)

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
