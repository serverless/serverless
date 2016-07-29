# Info

```
serverless info
```

Displays information about the service.

## Options
- `--stage` or `-s` The stage in your service you want to display information about.
- `--region` or `-r` The region in your stage that you want to display information about.


## Provided lifecycle events
- `info:info`

## Examples

```
$ serverless info

service: my-service
stage: dev
region: us-east-1
accountId: 12345678
endpoints:
  GET - https://..../dev/hello
functions:
  my-service-dev-hello:  arn:aws:lambda:us-east-1:12345678:function:my-service-dev-hello

```
