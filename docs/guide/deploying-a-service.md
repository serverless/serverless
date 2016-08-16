# Deploying a service

Let's deploy our service on the corresponding cloud provider infrastructure we've defined for our service.

## Deploying our service

Make sure that you're still in the service directory.

Run `serverless deploy` to start the deployment process.

Serverless will now deploy the whole service (with all it's functions and events which we'll add soon) to the
services cloud provider. It will use the default `dev` stage and `us-east-1` region.

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

**Note:** We keep the last 5 versions of your deployed code in the corresponding storage in the S3 bucket for your AWS account.

## Deploying to a different stage and region

Although the default stage and region is sufficient for our guide here you might want to deploy to different stages and
regions later on. You could accomplish this easily by providing corresponding options to the `deploy` command.

If you e.g. want to deploy to the `production` stage in the `eu-central-1` region your `deploy` command will look like
this: `serverless deploy --stage production --region eu-central-1`.

## Deploying VPC configuration for Lambda

You can add VPC configuration to a specific function in `serverless.yml` by adding a `vpc` object property in the function configuration. This object should contain the `securityGroupIds` and `subnetIds` array properties needed to construct VPC for this function. Here's an example configuration:

```yml
# serverless.yml
service: service-name
provider: aws

functions:
  hello:
    handler: handler.hello
    vpc:
      securityGroupIds:
        - securityGroupId1
        - securityGroupId2
      subnetIds: 
        - subnetId1
        - subnetId2
```

Or if you want to apply VPC configuration to all functions in your service, you can add the configuration to the higher level `provider` object, and overwrite these service level config at the function level. For example:

```yml
# serverless.yml
service: service-name
provider:
  name: aws
  vpc:
    securityGroupIds:
      - securityGroupId1
      - securityGroupId2
    subnetIds: 
      - subnetId1
      - subnetId2

functions:
  hello: # this function will overwrite the service level vpc config above
    handler: handler.hello
    vpc:
      securityGroupIds:
        - securityGroupId1
        - securityGroupId2
      subnetIds: 
        - subnetId1
        - subnetId2
  users: # this function will inherit the service level vpc config above
    handler: handler.users
```

Then, when you run `serverless deploy`, VPC configuration will be deployed along with your lambda function.

## Conclusion

We've just deployed our service! Let's invoke the services function in the next step.

[Next step > Invoking a function](invoking-a-function.md)
