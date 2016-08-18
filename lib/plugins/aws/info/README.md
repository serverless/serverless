# Info

This plugin displays information about the service.

## How it works

`Info` hooks into the [`info:info`](/lib/plugins/info) lifecycle. It will get the general information about the service and will query
CloudFormation for the `Outputs` of the stack. Outputs will include Lambda function ARN's, a `ServiceEndpoint` for the API Gateway endpoint and user provided custom Outputs.

### Lambda function ARN's

It uses the `Function[0-9]` CloudFormation Outputs.

**Example:**

```
$ serverless info

service: my-service
stage: dev
region: us-east-1
accountId: 12345678
endpoints:
  None
functions:
  my-service-dev-hello:  arn:aws:lambda:us-east-1:12345678:function:my-service-dev-hello
```

### API Gateway Endpoints

It uses the `ServiceEndpoint` CloudFormation Output together with the functions http events.

**Example:**

```
$ serverless info

service: my-service
stage: dev
region: us-east-1
accountId: 12345678
endpoints:
  GET - https://..../dev/users
  GET - https://..../dev/likes
functions:
  my-service-dev-users:  arn:aws:lambda:us-east-1:12345678:function:my-service-dev-users
  my-service-dev-likes:  arn:aws:lambda:us-east-1:12345678:function:my-service-dev-likes
```
