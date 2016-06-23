# serverless.yaml

The `serverless.yaml` file is the core for each service as it defines the whole configuration of your functions, their
corresponding events, the used plugins, custom resources etc.

This document will get into more detail about every part of the `serverless.yaml` file.

## A closer look

Here's an example `serverless.yaml` file for a service called `first-service`:

```yaml
service: first_service

plugins:
  - additional_plugin
  - another_plugin

custom: # for plugin authors to collect custom config

default_providers: &default_providers
  aws: # aws specific config
    timeout: 6
    memorySize: 1024
    runtime: nodejs4.3
  azure: # azure specific config
    disabled: false

functions: # if this gets too big, you can always use JSON-REF
  hello:
    name_template: ${stage}-${service}-${name}  # "name" references the function name, service the whole service name
    handler: handler.hello
    # only the following paths will be included in the resulting artefact uploaded to Lambda. Without specific include everything in the current folder will be included
    include:
      - lib
      - functions
    # The following paths will be excluded from the resulting artefact. If both include and exclude are defined we first apply the include, then the exclude so files are guaranteed to be excluded.
    exclude:
      - tmp
      - .git
    provider:
      <<: *default_providers
    events:
      aws:
        s3:
          - first-bucket
        http_endpoints:
          post: users/create
        schedule: rate(10 minutes)
      azure:
        http_endpoints:
          direction: in
          name: req

resources:
  aws_name_template: ${stage}-${service}-${name}  # "name" references the resource name, service the whole service name
  azure_name_template: # Resource naming template for Azure functions
  aws: # you can embed resources directly with the provider specific syntax
    Resources:
  azure_functions:
    $ref: ../azure_resources.json # you can use JSON-REF to ref other JSON files
  google:
    $ref: ../google_resources.yaml # you can use JSON-REF to ref other YAML files
```

There's much information in here. Let's go through it in more detail.

### Service name

```yaml
service: first_service
```

The service name defines how your service is called. It is used internally to identify all the corresponding resources
for your service and should be unique.

### Plugins

```yaml
plugins:
  - additional_plugin
  - another_plugin
```

The `plugins` section gives you the possibility to add 3rd party plugins to your Serverless service. Note that the
order in which the plugins are defined matters. At first Serverless loads all the core plugins and after that the
service plugins in the order you provide.

### Custom

```yaml
custom:
```

The `custom` section can be used to add custom logic which e.g. might be used by plugins.

### Default providers

```yaml
default_providers: &default_providers
  aws:
    timeout: 6
    memorySize: 1024
    runtime: nodejs4.3
  azure:
    disabled: false
```

`default_providers` is a way to define provider related configuration you want to reuse in e.g. your functions. Above you
can see some defaults for AWS functions. They will always have a timeout of 6, a memory size of 1024 and a Node.js runtime.
This way you don't have to re define those configurations for each and every function.

### Functions

```yaml
functions:
  hello:
    name_template: ${stage}-${service}-${name}
    handler: handler.hello
    include:
      - lib
      - functions
    exclude:
      - tmp
      - .git
    provider:
      <<: *default_providers
    events:
      aws:
        s3:
          - first-bucket
        http_endpoints:
          post: users/create
        schedule: rate(10 minutes)
      azure:
        http_endpoints:
          direction: in
          name: req
```

`functions` are the place to define all the functions which are used by the service.

Functions always start with a unique name (in the example above it's `hello`).

A `name_template` can be defined which makes it easy to e.g. namespace functions when they are deployed to the provider
of choice.

The handler property let's you the defines the functions handler. The handler definition might also include `parent` folder
such as `lib/handler.hello`. This way you can include specific folder which are also included into the function build which
will be uploaded on deployment.

`include` gives you the possibility to explicitly define which folders you want to include in your bundle.
`exclude` does the exact opposite. The files and folders defined here are excluded out of the bundle.
At first `exclude` and after that `include` is applied. This means that you can e.g. include previously excluded folders.

The `provider` section let you define provider specific configuration (such as the runtime of the function or the timeout).
In this case the [`default_providers`](#default-providers) section will be included here.

Serverless let's you build event driven applications. Your function can react to different provider specific events.
In our example the function will have 3 AWS events (one S3 event, a HTTP endpoint event and a scheduled event) and one
Azure event (One HTTP endpoint).
The events property is an abstraction layer which makes it easy for you to setup provider specific events.
However you can always use custom [`resources`](#resources) if you want to define more granular how your event should work.
Take a look at the [event sources document](/docs/guide/event-sources.md) to learn more about the different event sources.

### Resources

```yaml
resources:
  aws_name_template: ${stage}-${service}-${name}
  azure_name_template:
  aws:
    Resources:
  azure_functions:
    $ref: ../azure_resources.json
  google:
    $ref: ../google_resources.yaml
```

The last part of the `serverless.yaml` file is the `resources` section.
The `resources` section makes it possible to define provider specific custom resources.
An event source you want to integrate is not supported yet? This is the place where you might want to define your
implementation.

This file might get large. You can always use JSON REF to reference external `.json` and `.yaml` files for a better
separation.
