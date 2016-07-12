# Deploy

```
serverless deploy
```

Deploys your service.

## Options
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.

## Provided lifecycle events
- `deploy:initializeResources`
- `deploy:createProviderStacks`
- `deploy:createDeploymentPackage`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`

## Examples

### Deployment without stage and region options

```
serverless deploy
```

This is the simplest deployment usage possible. With this command Serverless will deploy your service to the defined
provider in the default stage (`dev`) to the default region (`us-east-1`).

### Deployment with stage and region options

```
serverless deploy --stage production --region eu-central-1
```

With this example we've defined that we want our service to be deployed to the `production` stage in the region
`eu-central-1`.
