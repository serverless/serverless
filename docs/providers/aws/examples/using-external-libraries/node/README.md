<!--
title: Using External libraries in Node.js Example
menuText: External libraries in Node.js
description: Create a Node.js using external libraries Lambda function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/examples/using-external-libraries/node/)
<!-- DOCS-SITE-LINK:END -->

# Using External libraries in Node.js Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

## 1. Install dependencies

For this example we are going to install the `faker` module from npm.

`npm install faker --save`

## 2. Install the faker module in your `handler.js` file

Inside of `handler.js` require your module:

`const faker = require('faker');`

## 3. Deploy

Run `serverless deploy`.

Alternatively, you can run `npm run deploy` and deploy via NPM script defined in the `package.json` file

## 4. Invoke

`serverless invoke --function helloRandomName`
