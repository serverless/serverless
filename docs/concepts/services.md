# Services

A *serverless service* is a group of one or multiple functions and any resources they require. By grouping related
functions together, it's easier to share code and and resources between those functions. Services are also designed to
be completely independent, which helps teams develop more quickly, without waiting for others.

Each *serverless service* contains two configuration files which describe it:

- `serverless.yaml`
  - Declares a serverless service
  - Defines one or multiple functions in the service
  - Defines events that trigger each function to execute (e.g., HTTP requests)
  - Defines one set of resources (e.g., 1 AWS CloudFormation stack) required by the functions in this service
  - Events listed in the `events` array may automatically create the resources required for the event upon deployment
  - Config can be specified for one or more IaaS providers
  - Re-usable and publicly shareable
  - Contains no author-specific information
 
- `serverless.env.yaml`
  - Contains author-specific information (not intended for version control)
  - Defines stages for this service
  - Defines stage-specific variables, which allows adding dynamic values to `serverless.yaml`, and helps keep out
  sensitive information

## Examples

### AWS Example

#### Service Structure

```
users
  lib // contains logic 
  node_modules
  package.json
  serverless.yaml
  serverless.env.yaml
  users.js // single handler file, requires lib
```

#### serverless.yaml

```yaml
service: users
plugins:
  - plugin
  - additional_plugin

default_providers: &default_providers
  aws:
    timeout: 6
    memorySize: 1024
    runtime: nodejs4.3
  azure:
    disabled: false

functions:
  create:
    name_template: ${stage}-${service}-${name}
    handler: users.create
    include:
      - lib
      - functions
    exclude:
      - .git
      - tmp
    events:
      aws:
        s3:
          - firstbucket
          - secondbucket
      azure:
        http_endpoint:
          direction: in
          name: req

resources:
  aws_name_template: ${stage}-${service}-${name}
  azure_name_template:
  aws:
    AWSTemplateFormatVersion: 2010-09-09
    Description: CloudFormation Resources
    Resources:
  azure:
    $ref: ../azure_resources.json
  google:
    $ref: ../google_resources.yaml
```

#### serverless.env.yaml

```yaml
vars: {}
stages:
  dev:
    vars: {}
    regions:
      aws_useast1:
        vars:
          iamRoleArnLambda: 'arn:aws:iam::12345678:role/crud-users-dev-IamRoleLambda-DJSKASD143'
```

## Deployment

These deployment steps always occur first:

- The `serverless.yaml` and `serverless.env.yaml` files are loaded into memory
- If YAML is used, it's converted to JSON
- References using Serverless variable syntax `${}` or Serverless template syntax `$${}` are loaded
- Loop through the `resources` property and collect resources for the targeted provider

### Deployment On Amazon Web Services

If the targeted provider is AWS, and the `serverless.yaml` contains AWS resources, these additional steps occur:

- A default AWS CloudFormation template is loaded.
- All of the resources in the `resources` property are added to that template.
- The compute resources found in the `functions` are added to that template (e.g., AWS Lambda Functions).
- Each event in the `functions.yourFunction.events` property is processed.  If it requires resources, these are also
added to the template.

### Deployment On Microsoft Azure

### Deployment On Google Cloud Platform

* To be continued... *


