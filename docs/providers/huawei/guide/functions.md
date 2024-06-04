# Huawei Cloud - Functions

If you are using Huawei Cloud Function Compute as a provider, all _functions_ inside the service are Huawei Cloud Function Compute functions.

## Configuration

All of the Huawei Cloud Function Compute in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: fg-service

provider:
  name: huawei

plugins:
  - serverless-huawei-functions

functions:
  first:
    handler: index.handler
```

## Handler

The `handler` property should be the function name you've exported in your entrypoint file.

When you e.g. export a function with the name `handler` in `index.js` your `handler` should be `handler: index.handler`.

```javascript
// index.js
exports.handler = (event, context, callback) => {};
```

## Memory size and timeout

The `memorySize` and `timeout` for the functions can be specified on the provider or function level. The provider wide definition causes all functions to share this config, whereas the function wide definition means that this configuration is only valid for the function.

The default `memorySize` is 256 MB and the default timeout is `30s` if not specified.

```yml
# serverless.yml

provider:
  memorySize: 512
  timeout: 90

functions:
  first:
    handler: first
  second:
    handler: second
    memorySize: 256
    timeout: 60
```

## Handler signatures

The signature of an event handler is:

```javascript
function (event, context) { }
```

### `event`

If the function is triggered by a Apig event specified, the `event` passed to the handler will be:

```javascript
// JSON.parse(event)
{
  events: {
    "body": "",
    "requestContext": {
        "apiId": "xxx",
        "requestId": "xxx",
        "stage": "RELEASE"
    },
    "queryStringParameters": {
        "responseType": "html"
    },
    "httpMethod": "GET",
    "pathParameters": {},
    "headers": {
        "accept-language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
        "accept-encoding": "gzip, deflate, br",
        "x-forwarded-port": "443",
        "x-forwarded-for": "xxx",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "upgrade-insecure-requests": "1",
        "host": "xxx",
        "x-forwarded-proto": "https",
        "pragma": "no-cache",
        "cache-control": "no-cache",
        "x-real-ip": "xxx",
        "user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:57.0) Gecko/20100101 Firefox/57.0"
    },
    "path": "/apig-event-template",
    "isBase64Encoded": true
  }
}
```

### `context`

The `context` argument contains the runtime information about a function. For example, request ID, temporary AK, and function metadata. 
See [Developing an Event Function](https://support.huaweicloud.com/devg-functiongraph/functiongraph_02_0410.html).

