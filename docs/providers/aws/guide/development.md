<!--
title: Serverless Framework - AWS Lambda Guide - Development
menuText: Running Functions
menuOrder: 4
description: How to run AWS Lambda functions authored with the Serverless Framework
layout: Doc
-->

# Running AWS Lambda Functions

The Serverless Framework allows you to run AWS Lambda functions you have deployed onto AWS, via the CLI.  It does not currently allow you to run functions locally, but this functionality is in the works.

To invoke a function that has been deployed to the cloud, run the invoke command:

`serverless invoke --function hello --path event.json --log`

This command includes an `--path event.json` which specifies that the data in the local `event.json` file should be used to invoke the funciton.

It also includes a `--log` command which prints logs for your invocation directly in the console.

## Viewing Function Logs

You can stream logs directly into your CLI for a specific AWS Lambda function, via the Serverless Framework.

Before viewing logs, make sure you have deployed your function and invoked it at least once.  Then use the `logs` command:

`serverless logs --function myFunction --tail`

By default, Serverless will fetch all the logs that happened in the past 30 minutes. You can overwrite this behavior by providing extra options.

The logs command provides different options you can use. Please take a look at the
[logs command documentation](../cli-reference/logs) to see what else you can do.