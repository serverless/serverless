<!--
title: Serverless Framework Commands - Apache OpenWhisk - Info
menuText: info
menuOrder: 9
description: Display information about your deployed service and the Apache OpenWhisk Functions, Events and Resources it contains.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/cli-reference/info)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Info

Displays information about the deployed service.

```bash
serverless info
```

## Options

- `--verbose` Shows displays any Stack Output.

## Provided lifecycle events

- `info:info`

## Examples

### Apache OpenWhisk

On Apache OpenWhisk the info plugin uses platform API to gather the necessary
information about deployed functions, events, routes and more. See the example
below for an example output.

**Example:**

```bash
$ serverless info
Service Information
platform:	openwhisk.ng.bluemix.net
namespace:	_
service:	hello-world

actions:
hello-world-dev-helloWorld

triggers:
my-hello-world-event

rules:
my-hello-world-event-rule

endpoints:
GET https://xxx-gws.api-gw.mybluemix.net/api/path --> hello-world-dev-helloWorld

endpoints (web actions):
**no web actions deployed**
```
