<!--
title: Including/Excluding files from packaging
layout: Doc
-->

# Including/Excluding files from packaging

Sometimes you might like to have more control over your function artifacts and how they are packaged.

You can use the `package` and `include/exclude` configuration for more control over the packaging process.

## Include
The `include` config allows you to selectively include files into the created package. Only the configured paths will be included in the package.

## Exclude

Exclude allows you to define paths that will be excluded from the resulting artifact. If both include and exclude are defined include is applied first, then exclude so files are guaranteed to be excluded.

## Artifact
For complete control over the packaging process you can specify your own zip file for your service. Serverless won't zip your service if this is configured.

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
