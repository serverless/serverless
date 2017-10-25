<!--
title: Serverless Framework Commands - Auth0 Webtasks - Invoke
menuText: invoke
menuOrder: 8
description: Invoke an Auth0 Webtask Function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/cli-reference/invoke)
<!-- DOCS-SITE-LINK:END -->

# Auth0 Webtasks - Invoke

Invokes a deployed Function. It allows you to send event data to the Function and returns the response.

```bash
serverless invoke --function functionName
```

## Options
- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--stage` or `-s` The stage in your service that you want to deploy to. The default stage is 'dev'.
- `--profile` or `-p` The Auth0 Webtasks profile to use when deploying your service. The 'serverless' profile is used by default.
- `--data` or `-d` String data to be passed as an event to your function. By default data is read from standard input.
- `--path` or `-p` The path to a JSON file with input data to be passed to the invoked function. This path is relative to the root directory of the service.

## Provided lifecycle events
- `invoke:invoke`

## Examples

### Invoking a Function

```bash
serverless invoke --function main
```

This example will invoke the 'main' function for the default 'dev' stage. The webtask will be invoked with an HTTP POST request by default. The command will return the HTTP status code and body of the response.

### Invoking a Function with data

```bash
serverless invoke --function main --data '{"message":"Serverless + Webtasks!"}'
```

This example will invoke the 'main' function for the default 'dev' stage. The webtask will be invoked with an HTTP POST and a request body that includes the JSON payload: `{"message":"Serverless + Webtasks!"}`.

### Invoking a Function with specific HTTP method

```bash
serverless invoke --function main --data '{"method":"GET", "body":{"message":"Serverless + Webtasks!"}}'
```

This example will invoke the 'main' function for the default 'dev' stage. The webtask will be invoked with an HTTP GET request and a request body that includes the JSON payload: `{"message":"Serverless + Webtasks!"}`.

### Invoking a Function with a request query string

```bash
serverless invoke --function main --data '{"query":{"message":"Serverless + Webtasks!"}}'
```

This example will invoke the 'main' function for the default 'dev' stage. The webtask will be invoked with an HTTP POST request and a request query string: `?message=Serverless%20%2B%20Webtasks!`.