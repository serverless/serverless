# Documentation

This docs section will include documentation relevant to understand how Serverless works.

You may want to start with the ["Your first service"](/docs/tutorials/your-first-service.md) tutorial to create, deploy,
invoke and remove your very first Serverless service!

If you're interested to take a look behind the scenes you might take a look at the [concepts](/docs/concepts) of
Serverless to understand the how Serverless is architected and works.

After that you should take a look at the different [plugins](/docs/plugins) which are used to deliver the functionality
Serverless provides (such as service creation, deployment, removal, function invocation etc.).

## Table of contents

- Concepts
  - [services](/docs/concepts/services.md) - Understanding Serverless services
  - [serverless.yaml](/docs/concepts/serverless-yaml.md) - A look at the `serverless.yaml` file
  - [serverless.env.yaml](/docs/concepts/serverless-env-yaml.md) - A look at the `serverless.env.yaml` file
  - [event sources](/docs/concepts/event-sources.md) - Understanding different types of event sources
  - [plugins](/docs/concepts/plugins.md) - How plugins work
- Tutorials
  - [Your first service](/docs/tutorials/your-first-service.md) - Create, deploy, invoke and remove your first service
  - [Event sources](/docs/tutorials/event-sources.md) - Learn how you can extend your services functionality with event
  sources
- Plugins
  - Core plugins
    - [create](/docs/plugins/core/create.md) - Creates a new Serverless service
    - [deploy](/docs/plugins/core/deploy.md) - Deploy your resources to your provider
    - [invoke](/docs/plugins/core/invoke.md) - Invoke your function
    - [remove](/docs/plugins/core/remove.md) - Remove a deployed service
  - AWS plugins
    - [awsCompileFunctions](/docs/plugins/aws/awsCompileFunctions.md) - Compiles the functions to CloudFormation resources
    - [awsCompileS3Events](/docs/plugins/aws/awsCompileS3Events.md) - Compiles the S3 events to CloudFormation resources
    - [awsCompileScheduledEvents](/docs/plugins/aws/awsCompileScheduledEvents.md) - Compiles the Scheduled events to
    CloudFormation resources
    - [awsDeploy](/docs/plugins/aws/awsDeploy.md) - Deploys the Serverless service to AWS
    - [awsInvoke](/docs/plugins/aws/awsInvoke.md) - Invokes a AWS lambda function
    - [awsRemove](/docs/plugins/aws/awsRemove.md) - Removes the service with all it's resources from AWS
