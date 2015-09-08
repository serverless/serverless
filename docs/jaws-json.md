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

* **envVars**: An array of environment variable names this project/module or lambda requires
* `project.stages`: map of all your stages, and regions those stages are in
* `project.envVarBucket`: name and region your s3 bucket that holds env var files
