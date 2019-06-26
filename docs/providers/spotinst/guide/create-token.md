<!--
title: Serverless Framework - Spotinst Functions Guide - Create Token
menuText: Create Token
menuOrder: 3
description: How to set up the Serverless Framework with your Spotinst Token
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/create-token)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Create Token

The Serverless Framework needs access to your Spotinst account so that it can create and manage resources on your behalf. To do this you will need either a permanent or temporary token that is linked to your account

## Create a Permanent Token

You can generate a Permanent Token from the [Spotinst Console](https://console.spotinst.com/#/settings/tokens/permanent).

> `WARNING`: Do not share your personal access token or your application secret with anyone outside your organization. Please contact our support if you’re concerned your token has been compromised.

## Temporary Access Token

You can also generate a the temporary access token, which is only valid for 2 hours (7200 seconds).

You can generate a temporary token from the [Spotinst Console](https://console.spotinst.com/#/settings/tokens/temporary). Or, using the below command:

```bash
$ curl -X POST -H "Content-Type: application/x-www-form-urlencoded" -d 'username=<USERNAME>&password=<PASSWORD>&grant_type=password&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>' https://oauth.spotinst.io/token
```

Replace the following parameters, more info can be found [here](https://console.spotinst.com/#/settings/tokens/temporary)

- `<USERNAME>`
- `<PASSWORD>`
- `<CLIENT_ID>`
- `<CLIENT_SECRET>`

The request will return two tokens:

```json
{
  "request": {
    "id": "a2285a3f-4950-4874-a931-1ee1cdf33012",
    "url": "/token",
    "method": "POST",
    "timestamp": "2017-08-30T22:00:34.610Z"
  },
  "response": {
    "status": {
      "code": 200,
      "message": "OK"
    },
    "kind": "spotinst:oauth2:token",
    "items": [
      {
        "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzcG90aW5zdCIsInVpZCI6LTgsIm9pZCI6NjA2MDc5ODYxOTExLCJyb2xlIjoyLCJleHAiOjE1MDQxMzc2MzQsImlhdCI6MTUwNDEzMDQzNH0.xyax",
        "tokenType": "bearer",
        "expiresIn": 7199
      }
    ],
    "count": 1
  }
}
```

- _accessToken_ - Use this token when making calls to Spotinst API
- _refreshToken_ - Use this token in order to refresh the temporary token. This will return a new token that is valid for additional 2 hours:

```bash
$ curl -X POST -H "Content-Type: application/x-www-form-urlencoded" -d 'refresh_token=<REFRESH_TOKEN>&grant_type=refresh_token&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>' https://api.spotinst.io/token
```
