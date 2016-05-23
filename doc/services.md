# Services

A serverless service is the unit of organization the Framework performs operations on.  

Each service contains two configuration files which describe it:

* **serverless.yml**
  * Declares a serverless service
  * Defines one or multiple functions in the service
  * Defines one set of resources (e.g., 1 AWS CloudFormation stack) required by the functions in this service
  * Defines events that trigger each function to execute (e.g., HTTP requests)
  * Events listed in the `events` array may automatically create the resources required for the event upon deployment
  * Designed to be developed and operated completely independently
  * Configuration information can be specified for multiple IaaS providers
  * Contains no author-specific information
  * Can be shared publicly and installed by anyone
 
* **serverless.meta.yml**
  * Contains author-specific information not intended for version control
  * Defines stages for this service
  * Defines service-wide, and stage-specific variables, which allows adding dynamic values to `serverless.yml`, and helps keep out sensitive information
  * Details separate profiles used for each stage in this service
  * The following variables are reserved: `service`, `function`, `stage` and `region`

## Examples

### AWS Example

#### Service Structure

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
description: A simple service for creating users

functions:
  create:
   extend: $${defaults}
   handler: users.create
   events:
     - http_endpoint_aws:
        path: users
        method: post

defaults:
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
  - aws_description: Resources for the ${service} service in the ${project} project.
  - aws_dynamodb_table:
      name: ${service}-${stage}-users
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
      extend: $${defaults}
      stageVariable: helloworld1
    regions:
      aws_useast1:
        creds:
          awsProfile: # optional, stage + region specific credentials
        vars:
          regionVariable: helloworld2

defaults:
  project: myApp
```

## Deployment

These general deployment steps always occur first:

* The `serverless.yml` and `serverless.meta.yml` files are loaded into two objects in memory (e.g., `service`, `meta`)
* If YAML is used, it's converted to JSON.
* If they contain references to other files, load them and populate the main configuration objects.
* Loop through the `resources` property and collect resources for the default provider (if only 1 provider exists in configuration) or for the targeted provider.

### Deployment On Amazon Web Services

If the targeted provider is AWS, and the `serverless.yml` contains AWS resources, these additional steps occur:

* A default AWS CloudFormation template is loaded.
* All of the resources in the `resources` property are added to that template.
* The compute resources found in the `functions` are added to that template (e.g., AWS Lambda Functions).
* Each event in the `functions.yourFunction.events` property is processed.  If it requires resources, these are also added to the template.

### Deployment On Microsoft Azure

### Deployment On Google Cloud Platform

*To be continued...*


