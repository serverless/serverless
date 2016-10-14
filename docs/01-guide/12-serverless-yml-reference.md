<!--
title: Serverless.yml reference
menuText: Serverless.yml reference
layout: Doc
-->

# Serverless.yml reference

The following is a reference of all non provider specific configuration. The details of those config options and further options can be found in [our guide](./) and the provider [provider configuration](../02-providers).

```yml
service: aws-nodejs # Name of the Service

defaults:  # default configuration parameters for Serverless
  variableSyntax: '\${{([\s\S]+?)}}' # Overwrite the default "${}" variable syntax to be "${{}}" instead. This can be helpful if you want to use "${}" as a string without using it as a variable.

provider: # Provider specific configuration. Check out each provider for all the variables that are available here
  name: aws

plugins:  # Plugins you want to include in this Service
  - somePlugin

custom:  # Custom configuration variables that should be used with the variable system
  somevar: something

package: # Packaging include and exclude configuration
  exclude:
    - exclude-me.js
  include:
    - include-me.js
  artifact: my-service-code.zip

functions: # Function definitions
  hello:
    handler: handler.hello
    events:  # Events triggering this function

resources: # Provider specific additional resources
```
