# Deploying a service

Let's deploy our service on the corresponding cloud provider infrastructure we've defined for our service.

## Deploying our service

Make sure that you're still in the service directory.

Run `serverless deploy` to start the deployment process.

Serverless will now deploy the whole service (with all it's functions and events which we'll add soon) to the
services cloud provider. It will use the default `stage` and `region` settings which are defined in
[`serverless.env.yaml`](../understanding-serverless/serverless-env-yaml.md).

The default stage is `dev` and default region is `us-east-1`.

You should see the progress of the deployment process in your terminal.
A success message will tell you once everything is deployed and ready to use!

## Deploying to a different stage and region

Although the default stage and region is sufficient for our guide here you might want to deploy to different stages and
regions later on. You could accomplish this easily by providing corresponding options to the `deploy` command.

If you e.g. want to deploy to the `production` stage in the `eu-central-1` region your `deploy` command will look like
this: `serverless deploy --stage production --region eu-central-1`.

## Conclusion

We've just deployed our service! Let's invoke the services function in the next step.

[Next step > Invoking a function](invoking-a-function.md)
