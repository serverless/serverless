<!--
title: Serverless Services
menuText: Services
menuOrder: 2
description: How to create a serverless service which contains your AWS Lambda functions, their events and infrastructure resources
layout: Doc
-->

# Creating A Service

A *Serverless Service* describes functions, events and infrastructure resources together and deploys them together.

Each Service translates to a single AWS CloudFormation template and a CloudFormation stack is created from that template.

To create a service, use the `create` command. You must also pass in a runtime (e.g., node.js, python, etc.) you would like to write the service in.  You can also pass in a path to create a directory and auto-name your service:

```
serverless create --template aws-nodejs --path myService
```

Here are the available runtimes for AWS Lambda:

* aws-nodejs
* aws-python
* aws-java-gradle
* aws-java-maven
* aws-scala-sbt

Check out the [create command docs](../cli-reference/create) for all the details and options.

## Open the service inside your editor

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

### handler.js

The `handler.js` file includes a function skeleton which returns a simple message. The function definition in `serverless.yml` will point to this `handler.js` file and the function inside of it.

Check out the code inside of the `handler.js` so you can play around with it once we've deployed the service.

### event.json

This file contains event data we'll use later on to invoke our function.

<!--
title: Removing Services
menuText: Removing Services
description: How to remove a deployed service
layout: Doc
-->

# Removing a service

The last step we want to introduce in this guide is how to remove the service.

Removal is done with the help of the `remove` command. Just run `serverless remove -v` to trigger the removal process. As in the deploy step we're also running in the `verbose` mode so you can see all details of the remove process.

Serverless will start the removal and informs you about it's process on the console. A success message is printed once the whole service is removed.

**Note:** The removal process will only remove the service on your providers infrastructure. The service directory will still remain on your local machine so you can still modify and (re)deploy it to another stage, region or provider later on.
