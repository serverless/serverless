# Deploy

```
serverless deploy [function]
```

Deploys your service.

## Options
- `--function` or `-f` The name of the function which should be deployed (**Note:** only available when running
`serverless deploy function`)
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.

## Provided lifecycle events
- `deploy:initialize`
- `deploy:setupProviderConfiguration`
- `deploy:createDeploymentArtifacts`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`
- `deploy:function:deploy`

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

### Deployment of a single function

This command deploy the function `func` in the default stage (`dev`) of the default region (`us-east-1`).

```
serverless deploy function --function func
```

### Deployment of a single function with stage and region

The function `func` will be deployed in the `production` stage of the `eu-central-1` region.

```
serverless deploy function --function func --stage production --region eu-central-1
```
