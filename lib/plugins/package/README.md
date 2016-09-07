# Package

This plugin creates a deployment package on a per service basis (it will zip up all code for the whole service). It does not provide any executable command.

## How it works

`Package` starts by hooking into the [`deploy:createDeploymentArtifacts`](/lib/plugins/deploy) lifecycle.

It will zip the whole service directory. The artifact will be stored in the `.serverless` directory which will be created
upon zipping the service. The resulting path to the artifact will be appended to the `service.package.artifact` property.

The services `include` and `exclude` arrays are considered during zipping. At first the `exclude` will be applied. After
that the `include` will be applied to ensure that previously excluded files and folders can be included again.

Serverless will automatically exclude `.git`, `.gitignore`, `serverless.yml`, and `.DS_Store`.

Servlerless will skip this step if the user has defined it's own artifact in the `service.package.artifact` property.

At the end it will do a cleanup by hooking into the `[after:deploy:deploy]`(/lib/plugins/deploy) lifecycle to remove the
`.serverless` directory.
