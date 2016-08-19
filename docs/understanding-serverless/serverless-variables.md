# Serverless Variables
The Serverless framework provides a powerful variable system to give your `serverless.yml` configuration file extra flexibility. With Serverless Variables, you'll be able to do the following: 

- Reference & load variables from environment variables
- Reference & load variables from CLI options
- Recursively reference properties of any type from the same `serverless.yml` file
- Recursively reference properties of any type from other YAML/JSON files
- Recursively nest variable references within each other for ultimate flexibility 

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

In the previous example you're dynamically adding a prefix to the function names by referencing the `stage` option that you pass in the CLI when you run `serverless deploy --stage dev`. So when you deploy, the function name will always include the stage you're deploying to.

## Recursively Self-Reference serverless.yml Properties
To self-reference properties in `serverless.yml`, you'll need to use the `${self.someProperty}` syntax in your `serverless.yml` configuration file. This functionality is recursive, so you can go as deep in the object tree as you want. Here's an example:

```yml
service: new-service
provider: aws
custom:
  globalSchedule: rate(10 minutes)
    
functions:
  hello:
      handler: handler.hello
      events:
        - schedule: ${self.custom.globalSchedule}
  world:
      handler: handler.world
      events:
        - schedule: ${self.custom.globalSchedule}
  
```

In the previous example you're setting a global schedule for all functions by referencing the `globalSchedule` property in the same `serverless.yml` file. This way, you can easily change the schedule for all functions whenever you like.

## Recursively Reference Variables in Other Files
To reference variables in other YAML or JSON file , you'll need to use the `${file(./myFile.yml).someProperty}` syntax in your `serverless.yml` configuration file. This functionality is recursive, so you can go as deep in that file as you want. Here's an example:

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
        - schedule: ${file(./myCustomFile.yml).globalSchedule} # Or you can reference a specific property
  world:
      handler: handler.world
      events:
        - schedule: ${self.custom.globalSchedule} # This would also work in this case
  
```

In the previous example you're referencing the entire `myCustomFile.yml` file in the `custom` property. You just need to pass the path relative to your service directory. You can also request specific properties in that file as shown in the `schedule` property. It's completely recursive and you can go as deep as you want.

## Nesting Variable References
The Serverless variable system allows you to nest variable references within each other for ultimate flexibility. So you can reference certain variables based on other variables. Here's an example:

```yml
service: new-service
provider: aws
custom:
  myFlexibleArn: ${env.${opt.stage}_arn}
    
functions:
  hello:
      handler: handler.hello
  
```

In the previous example, if you pass `dev` as a stage option, the framework will look for the `dev_arn` environment variable. If you pass `production`, the framework will look for `production_arn`, and so on. This allows you to creatively use multiple variables by using a certain naming pattern without having to update the values of these variables constantly. You can go as deep as you want in your nesting, and can reference variables at any level of nesting from any source (env, opt or self). Sky is the limit!


