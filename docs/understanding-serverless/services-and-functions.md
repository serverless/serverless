# Services

A *Serverless service* is a group of one or multiple functions and any resources they require. By grouping related
functions together, it's easier to share code and resources between those functions. Services are also designed to
be completely independent, which helps teams develop more quickly without waiting for others.

Each *Serverless service* contains two configuration files:

### [`serverless.yml`](./serverless-yml.md)
  - Declares a Serverless service
  - Defines one or multiple functions in the service
  - Defines the provider the service will be deployed to (and the runtime if provided)
  - Defines custom plugins to be used
  - Defines events that trigger each function to execute (e.g. HTTP requests)
  - Defines one set of resources (e.g. 1 AWS CloudFormation stack) required by the functions in this service
  - Events listed in the `events` section may automatically create the resources required for the event upon deployment
 
### [`serverless.env.yml`](./serverless-env-yml.md)
  - Defines stages for this service
  - Defines regions for each stage
  - Defines Serverless variables

## Example

Let's take a look at a service example to see how everything works together.

### Service Structure

```
users
  |__ lib                   // contains logic
  |__ users.js              // single handler file, requires lib
  |__ serverless.yml
  |__ serverless.env.yml
  |__ node_modules
  |__ package.json
```

### [`serverless.yml`](./serverless-yml.md)

```yml
service: users
provider:
  name: aws
  runtime: nodejs4.3
  memorySize: ${memoryVar} # reference a Serverless variable
functions:
  create:
    handler: users.create
```

### [`serverless.env.yml`](./serverless-env-yml.md)

```yml
vars:
  memoryVar: 512
stages:
  dev:
    vars:
    regions:
      us-east-1:
        vars:
```
