# Services

A *serverless service* is a group of one or multiple functions and any resources they require.  By grouping related functions together, it's easier to share code and and resources between those functions.  Services are also designed to be completely independent, which helps teams develop more quickly, without waiting for others.

Each *serverless service* contains two configuration files which describe it:

* **serverless.yml**
  * Declares a serverless service
  * Defines one or multiple functions in the service
  * Defines events that trigger each function to execute (e.g., HTTP requests)
  * Defines one set of resources (e.g., 1 AWS CloudFormation stack) required by the functions in this service
  * Events listed in the `events` array may automatically create the resources required for the event upon deployment
  * Config can be specified for one or more IaaS providers
  * Re-usable and publicly shareable
  * Contains no author-specific information
 
* **serverless.meta.yml**
  * Contains author-specific information (not intended for version control)
  * Defines stages for this service
  * Defines stage-specific variables, which allows adding dynamic values to `serverless.yml`, and helps keep out sensitive information
  * The following variables are reserved: `service`, `function`, `stage` and `region`
  * Specifies profiles or credentials to use per stage

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
   extend: $${defaults}
   creds:
    awsProfile: # stage specific profile
   vars:
    stageVariable: helloworld1
   regions:
    aws_useast1:
     creds:
      awsProfile: # optional, stage + region specific credentials
     vars:
      regionVariable: helloworld2

defaults:
  creds:
   awsProfile: default-profile
  vars:
   project: myApp
```

## Deployment

These deployment steps always occur first:

* The `serverless.yml` and `serverless.meta.yml` files are loaded into two objects in memory (e.g., `service`, `meta`)
* If YAML is used, it's converted to JSON
* References using Serverless variable syntax `${}` or Serverless template syntax `$${}` are loaded
* Loop through the `resources` property and collect resources for the targeted provider

### Deployment On Amazon Web Services

If the targeted provider is AWS, and the `serverless.yml` contains AWS resources, these additional steps occur:

* A default AWS CloudFormation template is loaded.
* All of the resources in the `resources` property are added to that template.
* The compute resources found in the `functions` are added to that template (e.g., AWS Lambda Functions).
* Each event in the `functions.yourFunction.events` property is processed.  If it requires resources, these are also added to the template.

### Deployment On Microsoft Azure

### Deployment On Google Cloud Platform

*To be continued...*


