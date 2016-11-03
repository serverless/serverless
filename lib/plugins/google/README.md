# Google Cloud Functions (Experimental)

This plugin directory provides several Serverless plugins so that your Serverless
services can be deployed in the Google Cloud.

**NOTE:** This quick start guide should be moved to the official docs later on.

## Getting started

You need two things setup so that you can use the Google Cloud integration:

1. Create a Google project which has access to all the necessary Google services
(especially the Google Cloud Functions)
2. Retrieve a `keyfile.json` with has full admin access to your project

Next up you simply need to export two environment variables:

### 1. Export your Google Cloud project

`export GCLOUD_PROJECT=my-awesome-project123`

### 2. Export your `keyfile.json`

`export GOOGLE_APPLICATION_CREDENTIALS=/some-dir/gcloud-keyfile.json`

That's it. You're now all set to use Serverless with GoogleCloud.

## An example service

Here's an example service you can use to get started.

**NOTE:** The file with your function handlers (the functions you export) must be
in the root of your service and named `index.js` or `function.js` (we recommend `index.js`).

```yml
service: my-test-service

provider:
  name: google
  runtime: nodejs4.3

functions:
  hello:
    handler: helloWorld
    events:
      - pubSub: someTopicName
  world:
    handler: helloGET
    events:
      - http: true
```

```javascript
// index.js
'use strict';

exports.helloWorld = function helloWorld (context, data) {
  console.log('My Cloud Function: ' + data.message);
  context.success();
};

exports.helloGET = function helloGET (req, res) {
  res.send('Hello World!');
};
```

Just create this service, `cd` into the directory and run `serverless deploy`.

### Example workflow

1. Deploy the service with `serverless deploy`
2. Invoke a function with `serverless invoke -f hello`
3. View the function logs with `serverless logs -f hello`
4. Remove the service with `serverless remove`
