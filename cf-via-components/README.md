# Custom CloudFormation resources via Serverless Components

An experiment on how to leverage existing [Serverless Components](https://github.com/serverless-components) via custom CloudFormation resources.

## Local Testing

1. `npm install`
1. `node zlocal-test.js <EventType>` (EventType can be `Create`, `Update` or `Delete`)

## Live Testing on AWS

You might want to use the AWS console to see the current status of you stack and look for the Bucket and its properties the custon resource creates.

1. `npm install`
1. `serverless deploy`
1. Change the S3 custom resource in `serverless.yml`
1. `serverless deploy`
1. `serverless remove`
