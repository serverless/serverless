# Configuration

Serverless Framework V1 deals with one serverless service at a time.  Each serverless service must contain two configuration files which declare and describe it:

* **serverless.yml** - Defines a serverless service and the resources it requires.  Can be shared publicly.
* **serverless.meta.yml** - Defines author-specific information, like stages, env vars, and all sensitive info.  Must be kept private.

## serverless.yml

* Declares a serverless service
* Defines one or multiple functions in the service
* Defines one set of resources (e.g., 1 AWS CloudFormation stack) required by the functions in this service
* Everything that can trigger the functions to execute (even HTTP requests) is considered an "event" and must be added in the `events` array.
* Events listed in the `events` array will automatically create the resources required for the event upon deployment
* Designed to be developed and operated completely independently
* Configuration information can be specified for multiple IaaS providers
* Contains no author-specific information
* Can be shared publicly and installed by anyone

## serverless.meta.yml

* Contains author-specific information not intended for version control
* Defines stages for this service
* Defines service-wide, and stage-specific variables, which allows adding dynamic values to `serverless.yml`, and helps keep out sensitive information
* Details separate profiles used for each stage in this service

## Examples

### AWS Example

#### Codebase

```
users
  lib // contains logic 
  node_modules
  package.json
  serverless.yml
  serverless.meta.yml
  users.js // single handler file, requires lib
```
#### serverless.yml

```
service: users
description: A simple service for creating & deleting users

functions:
  create:
   <<: *defaults
   events:
     - http_endpoint_aws:
        path: users
        method: post
  delete:
   <<: *defaults
   events:
     - http_endpoint_aws:
        path: users
        method: delete

defaults: &defaults
  name_template: ${service}-${stage}-${function}
  include:
   - ../parent/data.json
  exclude:
   - .git
  aws_lambda_function:
    runtime: nodejs4.3
    timeout: 6
    memory_size: 1024

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

#### serverless.meta.yml

```
stages:
  dev:
    creds:
      awsProfile: # stage specific credentials
    vars:
      <<: *defaults
      stageVariable: helloworld
    regions:
      aws_useast1:
        creds:
          awsProfile: # optional, stage+region specific credentials
        vars:
          <<: *defaults
          regionVariable: helloworld

defaults: &defaults
  team: ops-team-1
  
```

## Deployment

Here are the general deployment steps that always occur first:

* The `serverless.yml` and `serverless.meta.yml` files are loaded into two objects in memory (e.g., `service`, `meta`)
* If YAML is used, it's converted to JSON.
* If they contain references to other files, load them and populate the main configuration objects.
* Loop through the `resources` property and collect resources for the default provider (if only 1 provider exists in configuration) or for the targeted provider.

### Deployment On AWS

If the targeted provider is AWS, and the `serverless.yml` contains AWS resources, these additional steps occur:

* A default AWS CloudFormation template is loaded.
* All of the resources in the `resources` property are added to that template.
* The compute resources found in the `functions` are added to that template (e.g., AWS Lambda Functions).
* Each event in the `functions.yourFunction.events` property is processed.  If it requires resources, these are also added to the template.

*To be continued...*


