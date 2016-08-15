# Serverless Variables
The Serverless framework provides a powerful variable system to give your `serverless.yml` configuration file extra flexibility. With Serverless Variables, you'll be able to do the following: 

- Reference & load variables from environment variables
- Reference & load variables from CLI options
- Recursively reference properties of any type from the same `serverless.yml` file

## Referencing Environment Variables
To reference environment variables, you'll need to use the `${env.SOME_VAR}` syntax in your `serverless.yml` configuration file. Here's an example:

```yml
service: new-service
provider: aws
functions:
  hello:
      name: ${env.FUNC_PREFIX}-hello
      handler: handler.hello
  world:
      name: ${env.FUNC_PREFIX}-world
      handler: handler.world
  
```

In the previous example you're dynamically adding a prefix to the function names by referencing the `FUNC_PREFIX` env var. So you can easily change that prefix for all functions by changing the `FUNC_PREFIX` env var.

## Referencing CLI Options
To reference CLI options that you passed, you'll need to use the `${opt.some_option}` syntax in your `serverless.yml` configuration file. Here's an example:

```yml
service: new-service
provider: aws
functions:
  hello:
      name: ${opt.stage}-hello
      handler: handler.hello
  world:
      name: ${opt.stage}-world
      handler: handler.world
  
```

In the previous example you're dynamically adding a prefix to the function names by referencing the `stage` option that you pass in the CLI. So when you deploy, the function name will always include the stage you're deploying to.

## Referencing CLI Options
To reference CLI options that you passed, you'll need to use the `${opt.some_option}` syntax in your `serverless.yml` configuration file. Here's an example:

```yml
service: new-service
provider: aws
custom:
  globalSchedule: rate(10 minutes)
    
functions:
  hello:
      name: ${opt.stage}-hello
      handler: handler.hello
      events:
        - schedule: ${self.custom.globalSchedule}
  world:
      name: ${opt.stage}-world
      handler: handler.world
      events:
        - schedule: ${self.custom.globalSchedule}
  
```

In the previous example you're setting a global schedule for all functions by referencing the `globalSchedule` property in the same `serverless.yml` file. This way, you can easily change the schedule for all functions whenever you like.