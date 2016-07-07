# serverless.yaml

The `serverless.yaml` file is the core for each service as it defines the whole configuration of your functions, their
corresponding events, the used plugins, custom resources, and other service configuration.

Here's an example `serverless.yaml` file that touches on all the config details.

```yaml
service: first_service

provider: aws

plugins:
    - additional_plugin
    - another_plugin

defaults: # overwrite defaults
    stage: dev
    region: us-east-1
    memory: 512
    timeout: 3
  
functions:
    hello:
        # Deployed Lambda name with a prefix
        # You have to provide that variable in serverless.env.yaml
        name: ${prefix}-lambdaName
        handler: handler.hello
        # only the following paths will be included in the resulting artefact which will be uploaded. Without specific include everything in the current folder will be included
        include:
            - lib
            - functions
        # The following paths will be excluded from the resulting artefact. If both include and exclude are defined we first apply the include, then the exclude so files are guaranteed to be excluded
        exclude:
            - tmp
            - .git
        events:
            - s3: bucketName
            - schedule: rate(10 minutes)
            - http:
                path: users/create
                method: get
            - sns: topic-name

resources:
    Resources:
        $ref: ../custom_resources.json # you can use JSON-REF to ref other JSON files
```
