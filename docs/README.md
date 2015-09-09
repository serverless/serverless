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

## JAWS plug-in modules

TODO - link to docs/jaws-plugins.md
