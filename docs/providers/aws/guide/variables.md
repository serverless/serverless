<!--
title: Serverless Variables
menuText: Variables
menuOrder: 10
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/variables)
<!-- DOCS-SITE-LINK:END -->

# Variables

The Serverless framework provides a powerful variable system which allows you to add dynamic data into your `serverless.yml`. With Serverless Variables, you'll be able to do the following:

- Reference & load variables from environment variables
- Reference & load variables from CLI options
- Recursively reference properties of any type from the same `serverless.yml` file
- Recursively reference properties of any type from other YAML/JSON files
- Recursively nest variable references within each other for ultimate flexibility
- Combine multiple variable references to overwrite each other

**Note:** You can only use variables in `serverless.yml` property **values**, not property keys. So you can't use variables to generate dynamic logical IDs in the custom resources section for example.

## Reference Properties In serverless.yml
To self-reference properties in `serverless.yml`, use the `${self:someProperty}` syntax in your `serverless.yml`. `someProperty` can contain the empty string for a top-level self-reference or a dotted attribute reference to any depth of attribute, so you can go as shallow or deep in the object tree as you want.

```yml
service: new-service
provider: aws
custom:
  globalSchedule: rate(10 minutes)
  newService: ${self:}
  # the following will resolve identically in other serverless.yml files so long as they define
  # `custom.newService: ${file(<relative-path-to-this-file>/serverless.yml)}`
  exportName: ${self:custom.newService.service}-export

functions:
  hello:
      handler: handler.hello
      events:
        - schedule: ${self:custom.globalSchedule}
  world:
      handler: handler.world
      events:
        - schedule: ${self:custom.globalSchedule}
resources:
  Outputs:
    NewServiceExport:
      Value: 'A Value To Export'
      Export:
        Name: ${self:custom.exportName}
```

In the above example you're setting a global schedule for all functions by referencing the `globalSchedule` property in the same `serverless.yml` file. This way, you can easily change the schedule for all functions whenever you like.

## Referencing Environment Variables
To reference environment variables, use the `${env:SOME_VAR}` syntax in your `serverless.yml` configuration file.  It is valid to use the empty string in place of `SOME_VAR`.  This looks like "`${env:}`" and the result of declaring this in your `serverless.yml` is to embed the complete `process.env` object (i.e. all the variables defined in your environment).

**WARNING!**
If you use use the environment to provide sensitive data such as credentials or private keys to your project, there is a risk that this sensitive information could be written into less protected or publicly accessible build logs, CloudFormation templates, et cetera. Consider accordingly!

```yml
service: new-service
provider: aws
functions:
  hello:
      name: ${env:FUNC_PREFIX}-hello
      handler: handler.hello
  world:
      name: ${env:FUNC_PREFIX}-world
      handler: handler.world
```

In the above example you're dynamically adding a prefix to the function names by referencing the `FUNC_PREFIX` env var. So you can easily change that prefix for all functions by changing the `FUNC_PREFIX` env var.

## Referencing CLI Options
To reference CLI options that you passed, use the `${opt:some_option}` syntax in your `serverless.yml` configuration file.  It is valid to use the empty string in place of `some_option`.  This looks like "`${opt:}`" and the result of declaring this in your `serverless.yml` is to embed the complete `options` object (i.e. all the command line options from your `serverless` command).

```yml
service: new-service
provider: aws
functions:
  hello:
      name: ${opt:stage}-hello
      handler: handler.hello
  world:
      name: ${opt:stage}-world
      handler: handler.world
```

In the above example, you're dynamically adding a prefix to the function names by referencing the `stage` option that you pass in the CLI when you run `serverless deploy --stage dev`. So when you deploy, the function name will always include the stage you're deploying to.

## Reference Variables in Other Files
To reference variables in other YAML or JSON files, use the `${file(./myFile.yml):someProperty}` syntax in your `serverless.yml` configuration file. This functionality is recursive, so you can go as deep in that file as you want. Here's an example:

```yml
# myCustomFile.yml
globalSchedule: rate(10 minutes)
```

```yml
# serverless.yml
service: new-service
provider: aws
custom: ${file(./myCustomFile.yml)} # You can reference the entire file
functions:
  hello:
      handler: handler.hello
      events:
        - schedule: ${file(./myCustomFile.yml):globalSchedule} # Or you can reference a specific property
  world:
      handler: handler.world
      events:
        - schedule: ${self:custom.globalSchedule} # This would also work in this case
```

In the above example, you're referencing the entire `myCustomFile.yml` file in the `custom` property. You need to pass the path relative to your service directory. You can also request specific properties in that file as shown in the `schedule` property. It's completely recursive and you can go as deep as you want.

## Reference Variables in Javascript Files
To add dynamic data into your variables, reference javascript files by putting `${file(./myFile.js):someModule}` syntax in your `serverless.yml`.  Here's an example:

```js
// myCustomFile.js
module.exports.hello = () => {
   // Code that generates dynamic data
   return 'rate (10 minutes)';
}
```

```yml
# serverless.yml
service: new-service
provider: aws
functions:
  hello:
      handler: handler.hello
      events:
        - schedule: ${file(./myCustomFile.js):hello} # Reference a specific module
```

You can also return an object and reference a specific property.  Just make sure you are returning a valid object and referencing a valid property:

```yml
# serverless.yml
service: new-service
provider: aws
functions:
  scheduledFunction:
      handler: handler.scheduledFunction
      events:
        - schedule: ${file(./myCustomFile.js):schedule.ten}
```

```js
// myCustomFile.js
module.exports.schedule = () => {
   // Code that generates dynamic data
   return {
     ten: 'rate(10 minutes)',
     twenty: 'rate(20 minutes)',
     thirty: 'rate(30 minutes)'
   };
}
```

## Multiple Configuration Files

Adding many custom resources to your `serverless.yml` file could bloat the whole file, so you can use the Serverless Variable syntax to split this up.

```yml
resources:
  Resources: ${file(cloudformation-resources.json)}
```

The corresponding resources which are defined inside the `cloudformation-resources.json` file will be resolved and loaded into the `Resources` section.

## Nesting Variable References
The Serverless variable system allows you to nest variable references within each other for ultimate flexibility. So you can reference certain variables based on other variables. Here's an example:

```yml
service: new-service
provider: aws
custom:
  myFlexibleArn: ${env:${opt:stage}_arn}

functions:
  hello:
      handler: handler.hello
```

In the above example, if you pass `dev` as a stage option, the framework will look for the `dev_arn` environment variable. If you pass `production`, the framework will look for `production_arn`, and so on. This allows you to creatively use multiple variables by using a certain naming pattern without having to update the values of these variables constantly. You can go as deep as you want in your nesting, and can reference variables at any level of nesting from any source (env, opt, self or file).

## Overwriting Variables
The Serverless framework gives you an intuitive way to reference multiple variables as a fallback strategy in case one of the variables is missing. This way you'll be able to use a default value from a certain source, if the variable from another source is missing.

For example, if you want to reference the stage you're deploying to, but you don't want to keep on providing the `stage` option in the CLI. What you can do in `serverless.yml` is:

```yml
service: new-service
provider:
  name: aws
  stage: dev
custom:
  myStage: ${opt:stage, self:provider.stage}

functions:
  hello:
      handler: handler.hello
```

What this says is to use the `stage` CLI option if it exists, if not, use the default stage (which lives in `provider.stage`). So during development you can safely deploy with `serverless deploy`, but during production you can do `serverless deploy --stage production` and the stage will be picked up for you without having to make any changes to `serverless.yml`.

You can have as many variable references as you want, from any source you want, and each of them can be of different type and different name.

## Migrating serverless.env.yml
Previously we used the `serverless.env.yml` file to track Serverless Variables. It was a completely different system with different concepts. To migrate your variables from `serverless.env.yml`, you'll need to decide where you want to store your variables.

**Using a config file:** You can still use `serverless.env.yml`, but the difference now is that you can structure the file however you want, and you'll need to reference each variable/property correctly in `serverless.yml`. For more info, you can check the file reference section above.

**Using the same `serverless.yml` file:** You can store your variables in `serverless.yml` if they don't contain sensitive data, and then reference them elsewhere in the file using `self:someProperty`. For more info, you can check the self reference section above.

**Using environment variables:** You can instead store your variables in environment variables and reference them with `env.someEnvVar`. For more info, you can check the environment variable reference section above.

**Making your variables stage/region specific:** `serverless.env.yml` allowed you to have different values for the same variable based on the stage/region you're deploying to. You can achieve the same result by using the nesting functionality of the new variable system. For example, if you have two different ARNs, one for `dev` stage and the other for `prod` stage, you can do the following: `${env:${opt:stage}_arn}`. This will make sure the correct env var is referenced based on the stage provided as an option. Of course you'll need to export both `dev_arn` and `prod_arn` env vars on your local system.

Now you don't need `serverless.env.yml` at all, but you can still use it if you want. It's just not required anymore. Migrating to the new variable system is easy and you just need to know how the new system works and make small adjustments to how you store & reference your variables.
