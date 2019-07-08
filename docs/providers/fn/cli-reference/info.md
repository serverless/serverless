<!--
title: Serverless Framework Commands - Fn - Info
menuText: info
menuOrder: 5
description: Display information about your deployed service and the Fn Functions it contains.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/cli-reference/info)

<!-- DOCS-SITE-LINK:END -->

# Fn - Info

Displays information about the deployed service.

```bash
serverless info
```

## Provided lifecycle events

- `info:info`

## Examples

On Fn the info plugin uses the Fn API to gather the necessary
information about deployed functions and service. See the example
below for an example output.

**Example:**

```bash
$ serverless info
{
    "name": "boom",
    "created_at": "2018-04-23T18:50:17.755Z",
    "updated_at": "2018-04-23T18:50:17.755Z"
}
{
    "path": "/boomer",
    "image": "someuser/hello:1.0.28",
    "memory": 256,
    "cpus": "",
    "type": "sync",
    "format": "http",
    "config": {
        "boom": "Hello",
        "password": "green"
    },
    "timeout": 30,
    "idle_timeout": 45,
    "created_at": "2018-04-23T18:50:17.757Z",
    "updated_at": "2018-04-23T18:50:17.757Z"
}
{
    "path": "/hi",
    "image": "someuser/hi:1.0.23",
    "memory": 128,
    "cpus": "",
    "type": "sync",
    "format": "json",
    "config": {
        "something": "important",
    },
    "timeout": 30,
    "idle_timeout": 30,
    "created_at": "2018-04-23T18:50:21.691Z",
    "updated_at": "2018-04-23T18:50:21.691Z"
}

```
