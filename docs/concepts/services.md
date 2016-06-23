# Services

A *serverless service* is a group of one or multiple functions and any resources they require. By grouping related
functions together, it's easier to share code and resources between those functions. Services are also designed to
be completely independent, which helps teams develop more quickly, without waiting for others.

Each *serverless service* contains two configuration files which describe it:

- [`serverless.yaml`](/docs/concepts/serverless-yaml.md)
  - Declares a serverless service
  - Defines one or multiple functions in the service
  - Defines the provider the service will be deployed to
  - Defines events that trigger each function to execute (e.g. HTTP requests)
  - Defines one set of resources (e.g. 1 AWS CloudFormation stack) required by the functions in this service
  - Events listed in the `events` section may automatically create the resources required for the event upon deployment
  - Re-usable and publicly shareable
  - Contains no author-specific information
 
- [`serverless.env.yaml`](/docs/concepts/serverless-env-yaml.md)
  - Contains author-specific information (not intended for version control)
  - Defines stages for this service
  - Defines stage-specific variables, which allows adding dynamic values to `serverless.yaml`, and helps keep out
  sensitive information
  - Provides a way to define and use environment variables

## Examples

Let's take a look at a very minimal service example to see how everything works together.

### Service Structure

```
users
  |__ lib                   // contains logic
  |__ users.js              // single handler file, requires lib
  |__ serverless.yaml
  |__ serverless.env.yaml
  |__ node_modules
  |__ package.json
```

### serverless.yaml

```yaml
service: users
provider: aws
functions:
    create:
        handler: users.create
```

### serverless.env.yaml

```yaml
vars: {}
stages:
    dev:
        vars: {}
        regions:
            us-east-1:
                vars: {}
```

## Deployment

These deployment steps always occur first:

- The `serverless.yaml` and `serverless.env.yaml` files are loaded into memory
- If YAML is used, it's converted to JSON
- References using Serverless variable syntax `${}` or Serverless template syntax `$${}` are loaded
- Loop through the `resources` property if available and collect resources for the targeted provider

### Deployment On Amazon Web Services

These additional steps occur if the targeted provider is AWS:

- A default AWS CloudFormation template is loaded
- All of the resources in the `resources` property are added to that template
- The AWS related plugins will run and compile the defined functions and their events to corresponding resources which
will be added to the template

### Deployment on Microsoft Azure

* Work in progress *

### Deployment on Google Cloud Platform

* Work in progress *

### Deployment on IBM OpenWhisk

* Work in progress *
