<!--
title: Deploying Serverless Services
layout: Page
-->

# Deploying a service

Make sure that you're still in the service directory that we've created the service in before.

Run `serverless deploy` to start the deployment process (make sure that the credentials for your provider are properly configured).

Serverless will now deploy the whole service to the configured provider. It will use the default `dev` stage and `us-east-1` region.

You can change the default stage and region in your `serverless.yml` file by setting the `stage` and `region` properties inside a `provider` object as the following example shows:

```yml
# serverless.yml

service: service-name
provider:
  name: aws
  stage: beta
  region: us-west-2
```

After running `serverless deploy` you should see the progress of the deployment process in your terminal.
A success message will tell you once everything is deployed and ready to use!

## Deploying to a different stage and region

Although the default stage and region is sufficient for our guide here you might want to deploy to different stages and
regions later on. You could accomplish this easily by providing corresponding options to the `deploy` command.

If you e.g. want to deploy to the `production` stage in the `eu-central-1` region your `deploy` command will look like
this: `serverless deploy --stage production --region eu-central-1`.

You can also check out the [deploy command docs](../03-cli-reference/deploy.md) for all the details and options.

## Conclusion

We've just deployed our service! Let's invoke the services function in the next step.

[Next step > Invoking a function](./04-invoking-functions.md)
