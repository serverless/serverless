<!--
title: Serverless Framework Commands - Cloudflare Workers - Invoke
menuText: invoke
menuOrder: 3
description: Invoke a Cloudflare Workers Function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare-workers/cli-reference/invoke)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Invoke

Invokes a deployed function. It allows you to send an event to a deployed function, which can be useful for testing. Cloudflare Workers only support `GET` requests for now. The optional `headers` field allows you to specify headers that will be sent to your Worker along with your request.

```bash
serverless invoke --function functionName
```

In the following example, you could run:

```bash
serverless invoke --function helloWorld
```

```yml
# serverless.yml
 ...
functions:
  helloWorld:
    # What the script will be called on Cloudflare (this property value must match the function name one line above)
    name: helloWorld
    # The name of the script on your machine, omitting the .js file extension
    script: helloWorld
    events:
      - http:
          url: example.com/hello/user
          # Defines the method used by serverless when the `invoke` command is used. Cloudflare Workers only support GET requests for now
          method: GET
          headers:
            greeting: hi
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. Required.
- `--data` or `-d` String data to be passed as an event to your function. By default data is read from standard input.
- `--path` or `-p` The path to a json file with input data to be passed to the invoked function. This path is relative to the root directory of the service.

## Provided lifecycle events

- `invoke:invoke`

## Examples

### Cloudflare Workers

```bash
serverless invoke --function functionName
```

This example will invoke your deployed function on the configured Cloudflare Workers API URL endpoint. This will output the result of the request in your terminal.

#### Function invocation with data

```bash
serverless invoke --function functionName
```
