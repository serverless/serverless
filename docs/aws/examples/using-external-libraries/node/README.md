<!--
title: Hello World AWS Lambda Node Example
description: Create a nodeJS Lambda function on amazon web services
layout: Page
-->

# Using External libraries in Node

Make sure serverless is installed. [See installation guide](/link/here)

## 1. Install dependencies

For this example we are going to install the `faker` module from npm.

`npm install faker --save`

## 2. Install the faker module in your `handler.js` file

Inside of `handler.js` require your module.

`const faker = require('faker');`

## 1. Deploy

`serverless deploy` or `sls deploy`.

`sls` is shorthand for the serverless CLI command

Alternatively, you can run `npm run deploy` and deploy via NPM script defined in the `package.json` file

## 2. Invoke

`serverless invoke --function helloRandomName` or `sls invoke --f helloRandomName`

`-f` is shorthand for `--function`
