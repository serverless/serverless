<!--
title: Serverless Framework Commands - Kubeless - Info
menuText: info
menuOrder: 5
description: Display information about your deployed service and the Kubeless Functions it contains.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/cli-reference/info)

<!-- DOCS-SITE-LINK:END -->

# Kubeless - Info

Displays information about the deployed service.

```bash
serverless info
```

## Options

- `--verbose` or `-v` Shows the metadata of the Kubernetes objects.

## Provided lifecycle events

- `info:info`

## Examples

On Kubeless the info plugin uses the Kubernetes API to gather the necessary
information about deployed functions and Kubernetes services. See the example
below for an example output.

**Example:**

```bash
$ serverless info -v

Service Information "hello"
Cluster IP:  10.0.0.203
Type:  ClusterIP
Ports:
  Protocol:  TCP
  Port:  8080
  Target Port:  8080
Metadata
  Self Link:  /api/v1/namespaces/default/services/hello
  UID:  7c2494ea-8976-11e7-b8c4-0800275c88b3
  Timestamp:  2017-08-25T09:19:24Z
Function Info
Handler:  handler.hello
Runtime:  python2.7
Trigger:  HTTP
Dependencies:
Metadata:
  Self Link:  /apis/k8s.io/v1/namespaces/default/functions/hello
  UID:  7c214cab-8976-11e7-b8c4-0800275c88b3
  Timestamp:  2017-08-25T09:19:23Z
```
