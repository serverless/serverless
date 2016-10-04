<!--
title: Excluding files from packaging
menuText: Packaging Services
layout: Doc
-->

# Excluding files from packaging

Sometimes you might like to have more control over your function artifacts and how they are packaged.

You can use the `package` and `exclude` configuration for more control over the packaging process.

## Exclude

Exclude allows you to define globs that will be excluded from the resulting artifact.

## Artifact
For complete control over the packaging process you can specify your own zip file for your service. Serverless won't zip your service if this is configured so `exclude` will be ignored.

## Example

```yaml
service: my-service
package:
  exclude:
    - tmp/**
    - .git
  artifact: path/to/my-artifact.zip
```

## Packaging functions separately

If you want even more controls over your functions for deployment you can configure them to be packaged independently. This allows you more control for optimizing your deployment. To enable individual packaging set `individually` to true in the service wide packaging settings.

Then for every function you can use the same `exclude/artifact` config options as you can service wide. The `exclude` option will be merged with the service wide options to create one `exclude` config per function during packaging.

```yaml
service: my-service
package:
  individually: true
  exclude:
    - excluded-by-default.json
functions:
  hello:
    handler: handler.hello
    package:
      exclude:
        # We're excluding this file so it will not be in the final package of this function only
        - included-by-default.json
  world:
    handler: handler.hello
    package:
      exclude:
        - event.json
```
