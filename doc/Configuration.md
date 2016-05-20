# Configuration

Serverless Framework V1 deals with one service at a time.  These are known as *serverless services*.  Each *serverless service* must contain two configuration files which declare and describe it:

* **serverless.yml** - Defines a serverless service and the resources it requires.  Can be shared publicly.
* **serverless.meta.yml** - Defines author-specific information, like stages, env vars, and all sensitive info.  Must be kept private.

## serverless.yml

### Qualities

* Defines a serverless service
* Declares one or multiple functions in the service
* Declares one set of resources (e.g., 1 AWS CloudFormation stack) required by the functions in this service
* Everything that can trigger the functions to execute (even HTTP requests) is considered an "event" and must be added in the `events` array.
* Events listed in the `events` array will automatically create the resources required for the event upon deployment
* Designed to be developed and operated completely independently
* Configuration information can be specified for multiple IaaS providers
* Contains no author-specific information
* Can be shared publicly and installed by anyone

### Examples

#### AWS Example

```
service: users
description: A simple service for creating users

functions:
  create:
   <<: *defaults
   events:
     - http_endpoint_aws:
        path: users/create
        method: post
        cors: true

defaults: &defaults
  name_template: ${service}-${stage}-${function}
  include:
   - lib
  exclude:
   - .git
  aws_lambda_function:
    handler: users.create
    runtime: nodejs4.3
    timeout: 6
    memorySize: 1024

resources:
  - aws_name: ${service}-${stage}-resources
  - aws_description: The resources for the "${service}" service in the "${stage}" stage.
  - aws_dynamodb_table:
      resource_name: ${service}-${stage}-users
      table_name: ${service}-${stage}-users
      provisioned_throughput: 1
      key_schema: id

plugins:
  - plugin
  - additional_plugin
```

### Deployment

Here are the general deployment steps that always occur first:

* The `serverless.yml` and `serverless.meta.yml` files are loaded into two objects in memory (e.g., `service`, `meta`)
* If YAML is used, it's converted to JSON.
* If they contain references to other files, load them and populate the main configuration objects.
* Loop through the `resources` property and collect resources for the default provider (if only 1 provider exists in configuration) or for the targeted provider.

#### Deployment On AWS

If the targeted provider is AWS, and the `serverless.yml` contains AWS resources, these additional steps occur:

* A default AWS CloudFormation template is loaded.
* All of the resources in the `resources` property are added to that template.
* The compute resources found in the `functions` are added to that template (e.g., AWS Lambda Functions).
* Each event in the `functions.yourFunction.events` property is processed.  If it requires resources, these are also added to the template.

*To be continued...*


