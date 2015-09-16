# jaws.json

The `jaws.json` file contains configuration details for the included code and authorship details for easy publishing.  This is similar to `package.json` but for jaws-modules. `jaws.json` files exist at a few different levels in a JAWS proejct:  
*  **Project**: lives at the root of your project.  Defines things like stages.  [example here](../examples/project-jaws.json)
*  **`aws_modules` directory**: `jaws.json` exists for every lambda function. It defines things like memory size and api gateway endpoint configuration. [example here](../examples/lambda-jaws.json)
*  **JAWS plug-in module**: lives at the root of the hosted project

## Common jaws.json attributes

The following attributes should exist in either a project or lambda `jaws.json` at the top level

* **name**: project/module or lambda action name
* **version**: project/module or lambda [Semantic Versioning](http://semver.org/) number.
* **location**: project/module or lambda scm url (if exists)
* **author**: `John Serverless <john@gmail.com> http://www.john.com`
* **description**: project/module or lambda desc.

## Project level

See project `jaws.json` [example here](../examples/project-jaws.json)

* `project.stages`: map of all your stages, and regions those stages are in
* `project.envVarBucket`: name and region your s3 bucket that holds env var files

## Lambda level

See lambda `jaws.json` [example here](../examples/lambda-jaws.json)

##### Lambda attributes

**Note**: All of the attrs below assume the `lambda` attribute key prefix.

* `Handler,MemorySize,Runtime,Timeout`: can all be found in the [aws docs](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html)
  * We recommend 1024 memory to improve cold/warm start times. `handler` is relative to back dir 
* `envVars`: An array of environment variable names this project/module or lambda requires
* `deploy`: if true, this app will be deployed the next time the `jaws deploy --tags` is run. See `deploy` command docs for more info.
* `package`: How the code is packaged up into a zip file 
  * `optimize`: How code is optimized for node runtimes, to improve lambda cold start time
    * `builder`: only `"browserify"` or `false` supported now.  If `false` will just zip up entire `back` dir
    * `minify`: js minify or not
    * `ignore`: array of node modules to ignore. See [ignoring](https://github.com/substack/browserify-handbook#ignoring-and-excluding)
    * `exclude`: array of node modules to exclude.  These modules will be loaded externally (from within zip or inside lambda).  Note `aws-sdk` for node [can not be browserified](https://github.com/aws/aws-sdk-js/issues/696). See [ignoring](https://github.com/substack/browserify-handbook#ignoring-and-excluding)
    * `includePaths`: Paths rel to back (dirs or files) to be included in zip. Paths included after optimization step.
  * `excludePatterns`: Array of regular expressions rel to back. Removed before optimization step. If not optimizing, everything in back dir will be included in zip. Use this to exclude stuff you don't want in your zip.  Strings will be passed to `new RegExp()`

For an optimize example using the most popular node modules see [browserify tests](../tests/test-prj/back/aws_modules/bundle/browserify)

For non optimize example see [non optimized tests](../tests/test-prj/back/aws_modules/bundle/nonoptimized)

##### API Gateway (`endpoint`) attributes:

AUSTEN TODO...

## JAWS plug-in module

See plug-in module `jaws.json` [example here](../examples/plugin-module-jaws.json)

A JAWS plug-in module is installed into a project via the [`jaws install`](./commands.md#install) command.  A plugin module should have a `jaws.json` in the root of its reop, that opitonally contains a `cfExtensions` attribute that defines an AWS CloudFormation extension point, for the AWS resources required by this module.  These will be merged into the root [`jaws-cf.json`](./jaws-cf-json.md) if the user specifies the `--save` flag.

##### cfExtensions attributes

**Note**: All of the attrs below assume the `cfExtensions` attribute key prefix.

*  `PolicyDocumentStatements` is a list of valid CloudFormation PolicyDocument objects.  JAWS will create an IAM Group and Role who inherits these permissions.  Other IAM Roles can then easily be added to this group.  For example, an IAM Role can be made and added to this group for development/unit testing.  This Role will have the exact permissions of the IAM lambda Role for the stage.
*  `ResourceStatements` is a map of valid CloudFormation Resource statements.

Be sure to check out the [`jaws install`](./commands.md#install) command and [`jaws-cf.json`](./jaws-cf-json.md) docs for more info.
