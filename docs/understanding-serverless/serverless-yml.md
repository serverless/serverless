# serverless.yml

The `serverless.yml` file is the core for each service as it defines the whole configuration of your functions, their
corresponding events, the used plugins, custom resources, and other service configuration.

Here's an example `serverless.yml` file that touches on all the config details.

```yml
service: first-service

provider:
  name: aws
  runtime: nodejs4.3
  vpc: # optional, applies to all functions described herein but is overridden by any function level settings
    securityGroupIds:
      - securityGroupId1
      - securityGroupId2
    subnetIds:
      - subnetId1
      - subnetId2
  stage: beta # Overwrite the default "dev" stage.
  region: us-west-2 # Overwite the default "us-east-1" region.
  variableSyntax: '\${{([\s\S]+?)}}' # Overwrite the default "${}" variable syntax to be "${{}}" instead

plugins:
  - additional_plugin
  - another_plugin

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
    name: ${env.prefix}-lambdaName # Deployed Lambda name with a prefix
    handler: handler.hello # Uses the same configuration as your provider. Subdirectories are supported, depending on your language, e.g. subdir/handler.hello if handler.js is in subdir
    memorySize: 512 # optional, default is 1024
    timeout: 10 # optional, default is 6
    events:
      - s3: bucketName
      - schedule: rate(10 minutes)
      - http:
          path: users/create
          method: get
      - sns: topic-name
    vpc: # optional, applies only to this function and overrides any provider level settings
      securityGroupIds:
        - securityGroupId1
        - securityGroupId2
      subnetIds:
        - subnetId1
        - subnetId2

resources:
  Resources:
    $ref: ../custom_resources.json # you can use JSON-REF to ref other JSON files
```
