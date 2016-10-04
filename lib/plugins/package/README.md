# Package

This plugin creates a deployment package on a per service basis (it will zip up all code for the whole service). It does not provide any executable command.

## How it works

`Package` starts by hooking into the [`deploy:createDeploymentArtifacts`](/lib/plugins/deploy) lifecycle.

It will zip the whole service directory. The artifact will be stored in the `.serverless` directory which will be created
upon zipping the service. The resulting path to the artifact will be appended to the `service.package.artifact` property.

Services can use `exclude` as an array. The array should be a series of
globs to be considered for exclusion.

For example in serverless.yml:

``` yaml
package:
  exclude:
    - "test/**"
    - "**/spec.js"
```

Serverless will automatically exclude `.git`, `.gitignore`, `serverless.yml`, and `.DS_Store`.

Servlerless will skip this step if the user has defined it's own artifact in the `service.package.artifact` property.

At the end it will do a cleanup by hooking into the `[after:deploy:deploy]`(/lib/plugins/deploy) lifecycle to remove the
`.serverless` directory.
