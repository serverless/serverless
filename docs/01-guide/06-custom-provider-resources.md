<!--
title: Creating custom provider resources
description: How to extend your
layout: Doc
-->

# Custom provider resources

Sometimes you want to add custom provider resources to your service to use provider specific functionality which is not yet available through events or plugins. Serverless has you covered and enables you a convenient way to add those resources with the help of the `resources` section in the `serverless.yml` file.

**Note:** Your custom resources are merged on top of the resources Serverless defines. This gives you the power to overwrite existing resources easily, even the ones that are created automatically by Serverless. You need to be careful though to not disrupt Serverless functionality.

## Adding custom provider resources

Serverless uses the services `resources` object as a place to add more custom resources.

You can use this place to add custom provider resources by writing the resource definition in the provider specific YAML syntax inside the `resources` object. You can also use [Serverless Variables](./08-serverless-variables.md) for sensitive data or reusable configuration in your resources templates.

**Note:** You'll have the whole flexibility to overwrite / attach any kind of resource to your CloudFormation stack. You can add `Resources`, `Outputs` or even overwrite the `Description`. Please be cautious as overwriting existing parts of your CloudFormation stack might introduce unexpected behavior.

```yml
# serverless.yml
resources:
  Resources:
    CustomProviderResource:
      Type: ResourceType
      Properties:
        Key: Value
  Outputs:
    CustomOutput:
      Description: "Description for my output"
      Value: "My Custom Output"
```

### Example custom resources - S3 bucket
Sometimes you need an extra S3 bucket to store some data in (say, thumbnails). This works by adding an extra S3 Bucket Resource to your `serverless.yml`:

```yml
service: lambda-screenshots
provider: aws
functions:
  ...

resources:
  Resources:
    ThumbnailsBucket:
      Type: AWS::S3::Bucket
       Properties:
         # You can also set properties for the resource, based on the CloudFormation properties
         BucketName: my-awesome-thumbnails
         # Or you could reference an environment variable
         # BucketName: ${env.BUCKET_NAME}
```

Now that you have this additional resource defined in your `serverless.yml` file, you can simply run `serverless deploy` and that will deploy these custom resources for you along with your service and set up the additional bucket for you.

## Conclusion

The `resources` section inside the `serverless.yml` file is a place
where you can add custom, provider specific resource definitions which should be created on service deployment.
It gives you access to the whole feature set your provider offers and makes Serverless even more extensible.

The last thing we need to learn is how we can remove our service. Let's take a look at this now.

[Next step > Removing your service](./07-removing-services.md)
