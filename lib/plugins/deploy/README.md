# Deploy

```
serverless deploy --stage dev --region us-east-1
```

Deploys your service.

## Options
- `--stage` The stage in your service that you want to deploy to.
- `--region` The region in that stage that you want to deploy to.

## Provided lifecycle events
- `deploy:initializeResources`
- `deploy:createProviderStacks`
- `deploy:compileFunctions`
- `deploy:compileEvents`
- `deploy:deploy`

## Packaging
Note that you can define which files / folders should be excluded or included into your deployment with the help of
the `include` and `exclude` arrays in your `serverless.yaml` file.

Those two arrays are considered before we package your code for deployment.

At first the `exclude` array is checked. After that the files and folders inside the `include` array will be added. This
enables you a way to force inclusion of files and folder even if they are previously excluded.

The default files / folder which are exlucded are the following:
- `serverless.yaml`
- `serverless.env.yaml`
- `.git`
- `.gitignore`
- `.DS_Store`

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
