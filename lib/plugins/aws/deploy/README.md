# Deploy

This plugin (re)deploys the service to AWS.

```
serverless deploy [function]
```

Deploys your service.

## Options
- `--function` or `-f` The name of the function which should be deployed (**Note:** only available when running
`serverless deploy function`)
- `--stage` or `-s` The stage in your service that you want to deploy to.
- `--region` or `-r` The region in that stage that you want to deploy to.
- `--noDeploy` Skips the deployment steps and leaves artifacts in the `.serverless` directory

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

## How it works

`Deploy` starts by hooking into the [`deploy:setupProviderConfiguration`](/lib/plugins/deploy) lifecycle.
It fetches the basic CloudFormation template from `lib/templates` and replaces the necessary names and definitions
with the one it gets from the `serverless.yml` file.

Next up it deploys the CloudFormation template (which only includes the Serverless S3 deployment bucket) to AWS.

In the end it hooks into [`deploy:deploy`](/lib/plugins/deploy) lifecycle to update the previously created stack.

The `resources` section of the `serverless.yml` file is parsed and merged into the CloudFormation template.
This makes sure that custom resources the user has defined inside the `serverless.yml` file are added correctly.

**Note:** Empty, but defined `Resources` or `Outputs` sections are set to an empty object before being merged.

Next up it removes old service directories (with its files) in the services S3 bucket. After that it creates a new directory
with the current time as the directory name in S3 and uploads the services artifacts (e.g. the .zip file and the CloudFormation
file) in this directory. Furthermore it updates the stack with all the Resources which are defined in
`serverless.service.resources.Resources` (this also includes the custom provider resources).

The stack status is checked every 5 seconds with the help of the CloudFormation API. It will return a success message if
the stack status is `CREATE_COMPLETE` or `UPDATE_COMPLETE` (depends if you deploy your service for the first time or
redeploy it after making some changes).
