
# Tencent-scf - Deploy Function

The `sls deploy function` command deploys an individual SCF function when there is any change in the function. This is a much faster way of deploying changes in code.

```bash
serverless deploy function -f functionName
```

## Options

- `--function` or `-f` The name of the function which should be deployed
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.

## Examples

### Deployment without stage and region options

```bash
serverless deploy function --function helloWorld
```

### Deployment with stage and region options

```bash
serverless deploy function --function helloWorld --stage dev --region ap-guangzhou
```
