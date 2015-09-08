# jaws.json

The `jaws.json` file contains configuration details for the included code and authorship details for easy publishing.  This is similar to `package.json` but for jaws-modules. `jaws.json` files exist at a few different levels in a JAWS proejct:  
*  **Project**: lives at the root of your project.  Defines things like stages.
*  **`lambdas` directory**: `jaws.json` exists for every lambda function. It defines things like memory size and api gateway endpoint configuration.

## Common jaws.json attributes

The following attributes should exist in either a project or lambda `jaws.json`

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

**Note**: All of the attrs below assume the `lambda` attribute key prefix.

* `Handler,MemorySize,Runtime,Timeout`: can all be found in the [aws docs](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html)
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

For optimize example for the most popular node modules see [browserify tests](../tests/test-prj/back/lambdas/bundle/browserify)

For non optimize example see [non optimized tests](../tests/test-prj/back/lambdas/bundle/nonoptimized)
