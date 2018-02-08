<!--
title: Serverless Framework - Spotinst Functions Guide - Endpoint Setup
menuText: Endpoint Set Up
menuOrder: 9
description: How to set up an Endpoint 
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/credentials)
<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Endpoint Setup

You are able to set an alias URL name as an endpoint for your serverless function to make it more accessible to your users. The way this works is you will point the domain of your choosing to your environment URL's then you will set paths to each of the functions in that environment you wish to bundle in together. To do this you will first need a valid domain. For this example I will be using 'myAlias.com'. 

## Set DNS Record
First you will want to create a DNS record set that will point to your environment URL. Your environment URL can be found in the Spotinst console. When you select the environment you wish to connect you will see a list of functions and their individual URL's. Like this
```bash
https://app-123xyz-raffleapp-execute-function1.spotinst.io/fx-abc987
```
We only want the URL starting at app and ending before the function id. Like this
```bash
app-123xyz-raffleapp-execute-function1.spotinst.io
```
With this you will need to go to a DNS record setter and point your domain to this URL. I used AWS Route 53 to set this up.

## Set Alias
Next you will need to set the alias in your Spotinst environment by making an API call. This does not need to be done within a function and can be set anyway you are most comfortable. The API request is connecting your domain the environment that you want. This is the API request

### HTTPS Request 
```bash
POST alias?accountId=${accountId}
```
### Host
```bash
api.spotinst.io/functions/ 
```
### Body
```bash
{
  "alias": {
    "host": "myAlias.com",
    "environmentId": ${Your Environment ID}
  }
}
```
### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

**Note:** You are able to connect multiple alias to the same environment
 
## Set Up Pattern
After you have an alias set up you will need to set up pattern to connect to all the functions in the application. This is again another API call and can be done from anywhere. You specify the pattern that you want, the method that will trigger the function, the function ID and the environment ID. The pattern is what will appear after the domain. For example '/home' would point to 'myAlias.com/home'. The methods you can select are any of the usual HTTP request methods: GET, PUT, POST, DELETE , OPTIONS, PATCH, ALL where “ALL” matches every method

### HTTPS Request 
```bash
POST pattern?accountId=${accountId}
```
### Host
```bash
api.spotinst.io/functions/ 
```
### Body
``` bash
{
   "pattern": {
     "environmentId": ${Your Environment ID},
     "method": "ALL",
     "pattern": "/*",
     "functionId": ${Your Function ID}
   }
}
```
### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

## API Documentation
The full API documentation has information like delete and get alias and patterns. Check it out [here](./endpoint-api.md)
