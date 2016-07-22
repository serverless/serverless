# serverless.yaml

The `serverless.yaml` file is the core for each service as it defines the whole configuration of your functions, their
corresponding events, the used plugins, custom resources, and other service configuration.

Here's an example `serverless.yaml` file that touches on all the config details.

```yaml
service: first_service

provider:
    name: aws
    runtime: nodejs4.3

plugins:
  - additional_plugin
  - another_plugin

defaults: # overwrite defaults
  stage: dev
  region: us-east-1
  memory: 512
  timeout: 3

package:
  # only the following paths will be included in the resulting artifact which will be uploaded. Without specific include everything in the current folder will be included
  include:
    - lib
    - functions
  # The following paths will be excluded from the resulting artifact. If both include and exclude are defined we first apply the include, then the exclude so files are guaranteed to be excluded
  exclude:
    - tmp
    - .git
  artifact: path/to/my-artifact.zip # You can specify your own zip file for your service. Serverless won't zip your service if this is set

functions:
  hello:
    # Deployed Lambda name with a prefix
    name: ${prefix}-lambdaName # You have to provide that variable in serverless.env.yaml
    handler: handler.hello
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
