<!--
title: Including/Excluding files from packaging
menuText: Packaging Services
layout: Doc
-->

# Including/Excluding files from packaging

Sometimes you might like to have more control over your function artifacts and how they are packaged.

You can use the `package` and `include/exclude` configuration for more control over the packaging process.

## Include
The `include` config allows you to selectively include files into the created package. Only the configured paths will be included in the package. If both include and exclude are defined exclude is applied first, then include so files are guaranteed to be included.

## Exclude

Exclude allows you to define paths that will be excluded from the resulting artifact.

## Artifact
For complete control over the packaging process you can specify your own zip file for your service. Serverless won't zip your service if this is configured so `include` and `exclude` will be ignored.

## Example

```yaml
service: my-service
package:
  include:
    - lib
    - functions
  exclude:
    - tmp
    - .git
  artifact: path/to/my-artifact.zip
```


## Packaging functions separately

If you want even more controls over your functions for deployment you can configure them to be packaged independently. This allows you more control for optimizing your deployment. To enable individual packaging set `individually` to true in the service wide packaging settings.

Then for every function you can use the same `include/exclude/artifact` config options as you can service wide. The `include/exclude` options will be merged with the service wide options to create one `include/exclude` config per function during packaging.

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
      include:
        # We're including this file so it will be in the final package of this function only
        - excluded-by-default.json
  world:
    handler: handler.hello
    package:
      exclude:
        - event.json
```
