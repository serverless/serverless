
# Tencent-scf - Deploy List

The `sls deploy list [functions]` command will list information about your deployments.

You can either see all available deployments in your COS deployment bucket by running `serverless deploy list` or you can see the deployed functions by running `serverless deploy list functions`.

The displayed information is useful when rolling back a deployment or function via `serverless rollback`.

## Options

- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.

## Examples

### List existing deploys

```bash
serverless deploy list
```

### List deployed functions and their versions

```bash
serverless deploy list functions
```
