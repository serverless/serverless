# Deploy

```
serverless deploy --stage dev --region us-east-1
```

Deploys your service to AWS.

## Options
- `--stage` The stage in your service that you want to deploy to. **Required**.
- `--region` The region in that stage that you want to deploy to. **Required**.

## Examples

```
serverless deploy --stage dev --region us-east-1
```

This example will deploy your service to the `us-east-1` region in the `dev` stage. Will throw an error if this stage/region pair does not exist.
