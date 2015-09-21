# jaws.json

See project `jaws.json` [example here](../examples/project-jaws.json)

The `jaws.json` file contains project configuration and authorship details.

## Common jaws.json attributes

The following attributes should exist in either a project or lambda `jaws.json` at the top level

* **name**: project/module or lambda action name
* **version**: project/module or lambda [Semantic Versioning](http://semver.org/) number.
* **location**: project/module or lambda scm url (if exists)
* **author**: `John Serverless <john@gmail.com> http://www.john.com`
* **description**: project/module or lambda desc.
* **stages**: map of all your stages, and regions those stages are in as well as IAM roles
* **jawsBuckets**: map of region to bucket name for JAWS S3 bucket in the region
