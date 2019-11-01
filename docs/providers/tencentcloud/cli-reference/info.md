
# Tencent-scf - Info

Displays information about the deployed service, such as runtime, region, stage and function list.

```bash
serverless info
```

## Options

- `--stage` or `-s` The stage in your service you want to display information about.
- `--region` or `-r` The region in your stage that you want to display information about.

## Provided lifecycle events

- `info:info`

## Examples

```bash
$ sls info
Serverless:

Service Information
service: my-service
stage: dev
region: ap-guangzhou

Deployed functions:
  my-service-dev-function_one

Undeployed function:
  my-service-dev-function_two
```
