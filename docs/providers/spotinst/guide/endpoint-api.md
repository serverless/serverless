<!--
title: Serverless Framework - Spotinst Functions Guide - Endpoint API Documentation
menuText: Endpoint API Documentation
menuOrder: 7
description: How to use the Endpoint API 
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/credentials)
<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Endpoint API Documentation

Here is the full list of API calls that you can make to set alias and patterns. Please check out the full article on Setting Up Endpoints first because it will make more sense. 

## Alias
### Create Alias
Create a new alias to point to your environment

#### HTTPS Request 
```bash
POST alias?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Body
```bash
{
   "alias": {
     "host": "myAlias.com",
     "environmentId": ${Environment ID}
   }
}
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
 ```

### Get Alias
Returns a single alias

#### HTTPS Request 
```bash
GET alias/${Alias ID}?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

### Get All Alias
Returns all the alias in your account

#### HTTPS Request 
```bash
GET alias?accountId=${accountId}
```
##### Host
```bash
api.spotinst.io/functions/ 
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

### Delete Alias
Deletes a single alias

#### HTTPS Request 
```bash
DELETE alias/${Alias ID}?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```


## Pattern
### Create Pattern
Create a new pattern that maps to a function

#### HTTPS Request 
```bash
POST pattern?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Body
```bash
{
   "pattern": {
     "environmentId":${Environment ID},
     "method": "ALL",
     "pattern": "/*",
     "functionId": ${Function ID}
   }
}
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

### Update Pattern
Update and existing pattern

#### HTTPS Request 
```bash
PUT pattern/${Pattern ID}?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Body
```bash
{
  "pattern": {
    "environmentId":${Environment ID},
    "method": "ALL",
    "pattern": "/*",
    "functionId": ${Function ID}
  }
}
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

### Get Pattern
Returns a single pattern 

#### HTTPS Request 
```bash
GET pattern/${Pattern ID}?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

### Get All Patterns
Returns all the patterns your account

#### HTTPS Request 
```bash 
POST pattern?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```

### Delete Pattern
Delete a single pattern

#### HTTPS Request 
```bash
DELETE pattern/${Pattern ID}?accountId=${accountId}
```
#### Host
```bash
api.spotinst.io/functions/ 
```
#### Headers
```bash
Authorization: Bearer ${Spotinst API Token}
Content-Type: application/json
```
