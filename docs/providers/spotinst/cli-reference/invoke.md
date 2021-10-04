<!--
title: Serverless Framework Commands - Spotinst Functions - Invoke
menuText: invoke
menuOrder: 5
description: Invoke an Spotinst Functions Function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/cli-reference/invoke)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Invoke

Invokes a deployed function. You can send event data, read logs and display other important information of the function invocation.

```bash
serverless invoke -f functionName
```

## Pass Body Data

```bash
serverless invoke -f functionName --data "{}"
```

## Pass Body data via file

```bash
serverless invoke -f functionName --path data.json
```

#### Example `data.json`

```bash
$ cat data.json
{
	"Key": "Spotinst Functions is Value"
}
```

## Options

- `--function` or `-f` The name of the function in your service that you want to invoke. **Required**.
- `--data` or `-d` String data to be passed as an event to your function. By default data is read from standard input.
- `--path` or `-p` The path to a json file with input data to be passed to the invoked function. This path is relative to the root directory of the service.
- `--type` or `-t` The type of invocation. Either `RequestResponse`, `Event` or `DryRun`. Default is `RequestResponse`.
- `--log` or `-l` If set to `true` and invocation type is `RequestResponse`, it will output logging data of the invocation. Default is `false`.
