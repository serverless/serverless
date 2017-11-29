<!--
title: Serverless Framework - Spotinst Functions Guide - Document Store
menuText: Document Store
menuOrder: 7
description: How to use the Document Store feature
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/credentials)
<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Document Store

Document Store is a way for you to save information across function calls within the same environment without having to access an external database. It is secured by your Spotinst account credentials and can only be accesses within a function. Because you do not need to access an external database you are able to fetch stored documents with low latency (< ~5ms)

To access the document store you will need to make an API request inside a funciton formatted bellow.

## Add New Value

This is how to insert a new value into 

  * **Request:** POST
  * **Endpoint:** `https://api.spotinst.io/functions/environment/${environmentId}/userDocument?accountId=${accountId}`
  * **Header:**
```bash
{
	"Content-Type": "application/json",
	"Authorization": "Bearer ${Spotinst API Token}"
}
```
  * **Body:**
```bash
{
	"userDocument" : {
		"key": “${Your Key}”,
		"value": “${Your Value}”
	}
}
```

## Update Value

```bash

```

## Get Values

```bash

```

## Delete Value

```bash

```

## GitHub

Check out some examples to help you get started!

(Get All Values Function)[https://github.com/spotinst/spotinst-functions-examples/tree/master/node-docstore-getAll]
(Insert New Value Function)[https://github.com/spotinst/spotinst-functions-examples/tree/master/node-docstore-newValue]