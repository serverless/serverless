<!--
title: Deploying Serverless Services
menuText: Deploying Services
layout: Doc
-->

# Deploying a service

Make sure you're still working in the same directory you created the service in.

Run `serverless deploy -v` to start the deployment process (make sure that the credentials for your provider are properly configured). This command also prints the progress during the deployment, as we've configured the `verbose` mode.

Serverless now deploys the whole service to the configured provider. It uses the default `dev` stage and `us-east-1` region.

If you need to change the default stage and region, in your `serverless.yml` file, set the `stage` and `region` properties inside a `provider` object:

```yml
# serverless.yml

service: service-name
provider:
  name: aws
  stage: beta
  region: us-west-2
```

After you run `serverless deploy -v`, the progress of the deployment process displays in your terminal.
A success message tells you when everything is deployed and ready to use!

## Deploying to a different stage and region

If you want to deploy to different stages and regions later on, provide corresponding options to the `deploy` command.

For example, deploy to the `production` stage in the `eu-central-1` region by running a `deploy` command that looks like
this: `serverless deploy --stage production --region eu-central-1`.

Check out the [deploy command docs](../03-cli-reference/03-deploy.md) for all the details and options.

## Conclusion

You've just deployed your service! Let's invoke the services function in the next step.

[Next step > Invoking a function](./04-invoking-functions.md)
