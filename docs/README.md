# JAWS Docs

## Project layout

This is the scaffolding jaws-cli produces on the new command.  It’s bare because all logic has been modularized.

* back
  *  [.env](./commands.md#env)
  *  **lambdas**
     *  **users**
       *  **create**
         * [jaws.json](./jaws-json.md)
       *  **delete**
       *  **get**
* **front**
* **tests**
* [admin.env](./admin-env.md)
* [jaws.json](./jaws-json.md)
* [jaws-cf.json](./jaws-cf-json.md)

## JAWS CLI

JAWS is mostly a CLI.  The purpose of the jaws-cli is to make the server-less workflow easy.  This involves automation to help manage CloudFormation, multiple regions and stages, deployment of Lambda functions, AWS API Gateway endpoints.

See the [CLI Docs here](./commands.md)

## JAWS plug-in modules

See the [JAWS plug-in module guide](./plugin-module-guide.md)
