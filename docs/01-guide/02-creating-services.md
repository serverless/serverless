<!--
title: Creating Serverless Services
menuText: Creating Services
description: Creating a Serverless Service
layout: Doc
-->

# Creating a service

You can create a service based on a specific template that specifies which provider and runtime to use.

To create a service with a `nodejs` runtime running on `aws` just pass the `aws-nodejs` template to the create command:

```
serverless create --template aws-nodejs --name my-special-service
```

This will create a service and generate `serverless.yml`, `handler.js` and `event.json` files in the current working directory and set the name of the service to `my-special-service` in `serverless.yml`.

You can also check out the [create command docs](../03-cli-reference/01-create.md) for all the details and options.

## Open the service inside your editor

Let's take a closer look at the skeleton Serverless has created for us.

You'll see the following files in your working directory:
- `serverless.yml`
- `handler.js`
- `event.json`

### serverless.yml

Each *Serverless service* configuration is managed in the `serverless.yml` file. The main responsibilities of this file are:

  - Declares a Serverless service
  - Defines one or multiple functions in the service
  - Defines the provider the service will be deployed to (and the runtime if provided)
  - Defines custom plugins to be used
  - Defines events that trigger each function to execute (e.g. HTTP requests)
  - Defines one set of resources (e.g. 1 AWS CloudFormation stack) required by the functions in this service
  - Events listed in the `events` section may automatically create the resources required for the event upon deployment
  - Allow flexible configuration using Serverless Variables.

You can see the name of our service, the provider configuration and the first function inside the `functions` definition which points to the `handler.js` file. Any further service configuration will be done in this file.

### `handler.js`

The `handler.js` file includes a function skeleton which returns a simple message. The function definition in `serverless.yml` will point to this `handler.js` file and the function inside of it.

Check out the code inside of the `handler.js` so you can play around with it once we've deployed the service.

### `event.json`

This file contains event data we'll use later on to invoke our function.

## Conclusion

We've just created our very first service with one simple `create` command. With that in place we're ready to deploy
our service (which now includes one example function) to our provider (in this case Amazon Web Services).

[Next step > Deploying our service](./03-deploying-services.md)
