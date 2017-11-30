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

This is how to insert a new key/value pair into your document store in a specific environment

  * **Request:** `POST`
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

This is how to update a current key/value pair in your document store in a specific environment

  * **Request:** `PUT`
  * **Endpoint:** `https://api.spotinst.io/functions/environment/${environmentId}/userDocument/${Key}?accountId=${accountId}`
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
		"value": “${Your Value}”
	}
}
```


## Get Values

There are two ways to get the documents from your store, either by specifing a key which will return both the key and the value or you can just leave this out and you will get all the keys in the environment

### 1. Get Sinlge Key Pair

  * **Request:** `GET`
  * **Endpoint:** `https://api.spotinst.io/functions/environment/${environmentId}/userDocument/${Key}?accountId=${accountId}`
  * **Header:**
```bash
{
	"Content-Type": "application/json",
	"Authorization": "Bearer ${Spotinst API Token}"
}
```

### 2. Get All Keys

  * **Request:** `GET`
  * **Endpoint:** `https://api.spotinst.io/functions/environment/${environmentId}/userDocument?accountId=${accountId}`
  * **Header:**
```bash
{
	"Content-Type": "application/json",
	"Authorization": "Bearer ${Spotinst API Token}"
}
```


## Delete Value

This is how to delete a specific key value pair from your document store

  * **Request:** `DELETE`
  * **Endpoint:** `https://api.spotinst.io/functions/environment/${environmentId}/userDocument/${Key}?accountId=${accountId}`
  * **Header:**
```bash
{
	"Content-Type": "application/json",
	"Authorization": "Bearer ${Spotinst API Token}"
}
```


## GitHub

Check out some examples to help you get started!

[Get All Values Function](https://github.com/spotinst/spotinst-functions-examples/tree/master/node-docstore-getAll)

[Insert New Value Function](https://github.com/spotinst/spotinst-functions-examples/tree/master/node-docstore-newValue)