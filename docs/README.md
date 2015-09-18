# JAWS Docs

## Project layout

This is the scaffolding jaws-cli produces on the new command.  It’s bare because all logic has been modularized.  Here is a nodejs example:

* back
  *  [.env](./commands.md#env)
  *  **aws_modules**
     *  **jaws-core-js** 
       * awsm.json
       * package.json
       * **env**
         *  index.js 
     *  **users**
       *  **lib**  
       *  **create**
         *  awsm.json
          *  handler.js
          *  index.js
       *  **delete**
       *  **get**
* **cloudformation**
  * **mystage**
    *  **us-east-1**
      *  [resources-cf.json](./resources-cf-json.md)
      *  [lambdas-cf.json](./lambdas-cf-json.md)
* **front**
* **tests**
* [admin.env](./admin-env.md)
* [jaws.json](./jaws-json.md)

## JAWS CLI

JAWS is mostly a CLI.  The purpose of the jaws-cli is to make the server-less workflow easy.  This involves automation to help manage CloudFormation, multiple regions and stages, deployment of Lambda functions, AWS API Gateway endpoints.

See the [CLI Docs here](./commands.md)

## JAWS plug-in modules

See the [AWSM: Amazon Web Services Modules](https://github.com/awsm-org/awsm)
