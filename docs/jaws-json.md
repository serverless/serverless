# jaws.json

v
The `jaws.json` file contains project configuration and authorship details.
It defines things like the project's stages and regions within each stage,
 [like in this example.](../examples/project-jaws.json)

## Common jaws.json attributes

The following attributes should exist in either a project or lambda `jaws.json` at the top level

* **name**: project name
* **version**: project [Semantic Versioning](http://semver.org/) number.
* **location**: project scm url
* **author**: `John Serverless <john@gmail.com> http://www.john.com`
* **description**: project desc.

* `project.stages`: map of all your stages, and regions those stages are in
* `project.envVarBucket`: name and region your s3 bucket that holds env var files

## Lambda level

See lambda `jaws.json` [example here](../examples/lambda-jaws.json)


## JAWS plug-in module

See plug-in module `jaws.json` [example here](../examples/plugin-module-jaws.json)

A JAWS plug-in module is installed into a project via the [`jaws install`](./commands.md#install) command.  A plugin module should have a `jaws.json` in the root of its reop, that opitonally contains a `cfExtensions` attribute that defines an AWS CloudFormation extension point, for the AWS resources required by this module.  These will be merged into the root [`jaws-cf.json`](./jaws-cf-json.md) if the user specifies the `--save` flag.

##### cfExtensions attributes

**Note**: All of the attrs below assume the `cfExtensions` attribute key prefix.

*  `PolicyDocumentStatements` is a list of valid CloudFormation PolicyDocument objects.  JAWS will create an IAM Group and Role who inherits these permissions.  Other IAM Roles can then easily be added to this group.  For example, an IAM Role can be made and added to this group for development/unit testing.  This Role will have the exact permissions of the IAM lambda Role for the stage.
*  `ResourceStatements` is a map of valid CloudFormation Resource statements.

Be sure to check out the [`jaws install`](./commands.md#install) command and [`jaws-cf.json`](./jaws-cf-json.md) docs for more info.
