# Services

A *Serverless service* is a group of one or multiple functions and any resources they require. By grouping related
functions together, it's easier to share code and resources between those functions. Services are also designed to
be completely independent, which helps teams develop more quickly without waiting for others.

Each *Serverless service* configuration is managed in the [`serverless.yml`](./serverless-yml.md) file. The main responsibilities of this file are:

  - Declares a Serverless service
  - Defines one or multiple functions in the service
  - Defines the provider the service will be deployed to (and the runtime if provided)
  - Defines custom plugins to be used
  - Defines events that trigger each function to execute (e.g. HTTP requests)
  - Defines one set of resources (e.g. 1 AWS CloudFormation stack) required by the functions in this service
  - Events listed in the `events` section may automatically create the resources required for the event upon deployment
  - Allow flexible configuration using Serverless Variables.

## Example

Let's take a look at a service example to see how everything works together.

### Service Structure

```
users
  |__ lib                   // contains logic
  |__ users.js              // single handler file, requires lib
  |__ serverless.yml
  |__ node_modules
  |__ package.json
```

### [`serverless.yml`](./serverless-yml.md)

```yml
service: users
provider:
  name: aws
  runtime: nodejs4.3
  memorySize: ${env.memoryVar} # Serverless Variable referencing an env var
functions:
  create:
    handler: users.create
```