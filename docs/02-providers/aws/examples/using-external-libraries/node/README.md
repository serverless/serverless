<!--
title: Using external libraries in Node.js service
menuText: External libraries in Node.js service
description: Create a nodeJS Lambda function on amazon web services
layout: Doc
-->

# Using external libraries in Node.js service

Make sure `serverless` is installed. [See installation guide](/docs/01-guide/01-installing-serverless.md)

## 1. Install dependencies

For this example we are going to install the `faker` module from npm.

`npm install faker --save`

## 2. Use the faker module in your `handler.js` file

Inside of `handler.js` require your module.

`const faker = require('faker');`

## 3. Deploy

`serverless deploy`

## 4. Invoke

`serverless invoke -f helloRandomName`

In your terminal window you should see the response from AWS Lambda

```bash
{
    "message": "Hello Floyd"
}
```

