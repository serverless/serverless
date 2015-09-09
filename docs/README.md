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

##### new

This makes a new JAWS project by creating the file structure in the [project layout]() section to the current working directory.

First walks the user through the following prompts asking for their AWS credentials/profile and their project specifications
Creates a CloudFormation Stack for the user’s first stage, which creates an IAM Group and a staged IAM Role for that IAM Group
Creates all project scaffolding in current working directory
Creates an AWS API Gateway REST API for the project
Creates env var file in the s3 bucket (created if not exist) for the initial stage


## JAWS plug-in modules

TODO - link to docs/jaws-plugins.md
