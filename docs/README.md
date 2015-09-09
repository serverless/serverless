# JAWS Docs

## Project layout

This is the scaffolding jaws-cli produces on the new command.  It’s bare because all logic has been modularized.

* `back`
  *  `lambdas`
  *  [`.env`](./commands.md#env)
* `front`
* `tests`
* [`admin.env`](./admin-env.md)
* [`jaws.json`](./jaws-json.md)
* [`jaws-cf.json`](./jaws-cf-json.md)
* [`jaws.json`](./jaws-json.md)

## JAWS CLI

JAWS is mostly a CLI.  The purpose of the jaws-cli is to make the server-less workflow easy.  This involves automation to help manage CloudFormation, multiple regions and stages, deployment of Lambda functions, AWS API Gateway endpoints.

Below are a list of available commands.  Commands will interactively prmopt for input if needed. Command line options are available for every input.  All commands will return non 0 code if error. [View list of errors](../lib/jaws-error/index.js#L24).

All commands usage can be found by running `jaws -h` or `jaws <sub-command> -h`

### jaws new

Creates a new project, new region in existing project, or new stage in existing region.  The new command by default creates resources in AWS (via CloudFormation)

##### type `project`

This makes a new JAWS project by creating the file structure in the [project layout](./README.md#project-layout) section to the current working directory.

1.  Walks the user through the following prompts asking for their AWS credentials/profile and their project specifications
1.  Creates a CloudFormation Stack for the user’s first stage, which creates an IAM Group and a staged IAM Role for that IAM Group
1.  Creates all project scaffolding in current working directory
1.  Creates an AWS API Gateway REST API for the project
1.  Creates environment var file in the s3 bucket (created if DNE) for the initial stage. [Why s3?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-do-you-use-an-s3-bucket-to-store-env-vars)

##### type `region`

Creates new region in existing project.  By default executes CloudFormation to make one stage in new region.

##### type `stage`

Creates a new stage in existing region.  By default executes CloudFormation to make new stage.

### jaws generate

This command generates code/configuration on your local machine. It does not make AWS resources.  By default will prompt to generate the following:

* A lambda function in the `lambdas/back` folder with basic scaffolding.
* An API gateway configuration 

### jaws dash

Interactive dashboard used to get an overview of your project and deploy resources

### jaws env

Manages enviornment variable files - both in s3 and local (`back/.env`).  Supported operations:

* `list`: List all env vars for given stage. Will display env vars that each jaws-module uses AND indicates env vars that are not yet set.
* `get`: get the value for a specific key
* `set`: set value for key
* `unset`: remove a specific key

### jaws tag

Non-interactive way (dash alternative) to indicate which (or all) labmda|api changes to deploy when the `jaws deploy` command is run.

### jaws deploy

Non-interactive way (dash alternative) to deploy lambda|api resources that have been `jaws tag`.  If `jaws deploy` is run from a lambda dir (has `lambda` attr defined in its `jaws.json`) it will automatically tag and then deploy.

When deploying a Lambda function to AWS, JAWS will:

*  Check the Runtime specified in the current lambda’s jaws.json (dir running JAWS cli from) and perform a corresponding build pipeline.  Optionally optimize the code for performance in Lambda (browserify & uglifyjs2).  See the [lambda attributes](./jaws-json.md#lambda-attributes) for optimization options. [Why optimize?](https://github.com/jaws-framework/JAWS/wiki/FAQ#why-optimize-code-before-deployment)
*  Create or update lambda using this naming convention: STAGE_-_PROJECTNAME_-_FUNCTIONNAME.  For example: prod_-_MyApp_-_usersSignup
* Upload the file as a buffer directly to AWS.


## JAWS plug-in modules

TODO - link to docs/jaws-plugins.md
