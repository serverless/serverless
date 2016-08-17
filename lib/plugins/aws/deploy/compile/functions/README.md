# Compile Functions

This plugins compiles the functions in `serverless.yml` to corresponding lambda CloudFormation resources.

## How it works

`Compile Functions` hooks into the [`deploy:compileFunctions`](/lib/plugins/deploy) lifecycle.

It loops over all functions which are defined in `serverless.yml`.

Inside the function loop it creates corresponding CloudFormation lambda function resources based on the settings
(e.g. function `name` property or service `defaults`) which are provided in the `serverless.yml` file.

The function will be called `<serviceName>-<stage>-<functionName>` by default but you can specify an alternative name
with the help of the functions `name` property.

The functions `MemorySize` is set to `1024` and `Timeout` to `6`. You can overwrite those defaults by setting
corresponding entries in the services `provider` or function property.

At the end all CloudFormation function resources are merged inside the compiled CloudFormation template.
