<!--
title: Serverless Variables
menuText: Variables
menuOrder: 10
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/variables)

<!-- DOCS-SITE-LINK:END -->

# Azure - Variables

The Serverless framework provides a powerful variable system which allows you to
add dynamic data into your `serverless.yml`. With Serverless Variables, you'll be
able to do the following:

- Reference & load variables from environment variables
- Reference & load variables from CLI options
- Recursively reference properties of any type from the same `serverless.yml` file
- Recursively reference properties of any type from other YAML/JSON files
- Recursively nest variable references within each other for ultimate flexibility
- Combine multiple variable references to overwrite each other

**Note:** You can only use variables in `serverless.yml` property **values**,
not property keys. So you can't use variables to generate dynamic logical IDs in
the custom resources section for example.

## Reference Properties In serverless.yml

To self-reference properties in `serverless.yml`, use the `${self:someProperty}`
syntax in your `serverless.yml`. This functionality is recursive, so you can go
as deep in the object tree as you want.

```yml
service: new-service
provider: azure
custom:
  globalSchedule: cron(0 * * * *)

functions:
  hello:
    handler: handler.hello
    events:
      - timer: ${self:custom.globalSchedule}
  world:
    handler: handler.world
    events:
      - timer: ${self:custom.globalSchedule}
```

In the above example you're setting a global schedule for all functions by
referencing the `globalSchedule` property in the same `serverless.yml` file. This
way, you can easily change the schedule for all functions whenever you like.

## Reference Variables in other Files

You can reference variables in other YAML or JSON files. To reference variables in other YAML files use the `${file(./myFile.yml):someProperty}` syntax in your `serverless.yml` configuration file. To reference variables in other JSON files use the `${file(./myFile.json):someProperty}` syntax. It is important that the file you are referencing has the correct suffix, or file extension, for its file type (`.yml` for YAML or `.json` for JSON) in order for it to be interpreted correctly. Here's an example:

```yml
# myCustomFile.yml
cron: cron(0 * * * *)
```

```yml
# serverless.yml
service: new-service
provider: azure

custom: ${file(./myCustomFile.yml)} # You can reference the entire file

functions:
  hello:
    handler: handler.hello
    events:
      - timer: ${file(./myCustomFile.yml):cron} # Or you can reference a specific property
  world:
    handler: handler.world
    events:
      - timer: ${self:custom.cron} # This would also work in this case
```

In the above example, you're referencing the entire `myCustomFile.yml` file in the `custom` property. You need to pass the path relative to your service directory. You can also request specific properties in that file as shown in the `cron` property. It's completely recursive and you can go as deep as you want. Additionally you can request properties that contain arrays from either YAML or JSON reference files. Here's a YAML example for an events array:

```yml
myevents:
  - timer: cron(0 * * * *)
```

and for JSON:

```json
{
  "myevents": [
    {
      "timer": "cron(0 * * * *)"
    }
  ]
}
```

In your serverless.yml, depending on the type of your source file, either have the following syntax for YAML

```yml
functions:
  hello:
    handler: handler.hello
    events: ${file(./myCustomFile.yml):myevents
```

or for a JSON reference file use this syntax:

```yml
functions:
  hello:
    handler: handler.hello
    events: ${file(./myCustomFile.json):myevents
```

**Note:** If the referenced file is a symlink, the targeted file will be read.

## Reference Variables in JavaScript Files

You can reference JavaScript files to add dynamic data into your variables.

References can be either named or unnamed exports. To use the exported `someModule` in `myFile.js` you'd use the following code `${file(./myFile.js):someModule}`. For an unnamed export you'd write `${file(./myFile.js)}`.

```js
// scheduleConfig.js
module.exports.cron = () => {
  // Code that generates dynamic data
  return 'cron(0 * * * *)';
};
```

```js
// config.js
module.exports = () => {
  return {
    property1: 'some value',
    property2: 'some other value',
  };
};
```

```yml
# serverless.yml
service: new-service
provider: azure

custom: ${file(./config.js)}

functions:
  hello:
    handler: handler.hello
    events:
      - timer: ${file(./scheduleConfig.js):cron} # Reference a specific module
```

You can also return an object and reference a specific property. Just make sure
you are returning a valid object and referencing a valid property:

```yml
# serverless.yml
service: new-service
provider: azure
functions:
  scheduledFunction:
    handler: handler.scheduledFunction
    events:
      - timer: ${file(./myCustomFile.js):schedule.hour}
```

```js
// myCustomFile.js
module.exports.schedule = () => {
  // Code that generates dynamic data
  return {
    hour: 'cron(0 * * * *)',
  };
};
```

## Multiple Configuration Files

Adding many custom resources to your `serverless.yml` file could bloat the whole file, so you can use the Serverless Variable syntax to split this up.

```yml
resources:
  Resources: ${file(azure-resources.json)}
```

The corresponding resources which are defined inside the `azure-resources.json` file will be resolved and loaded into the `Resources` section.

## Migrating serverless.env.yml

Previously we used the `serverless.env.yml` file to track Serverless Variables. It was a completely different system with different concepts. To migrate your variables from `serverless.env.yml`, you'll need to decide where you want to store your variables.

**Using a config file:** You can still use `serverless.env.yml`, but the difference now is that you can structure the file however you want, and you'll need to reference each variable/property correctly in `serverless.yml`. For more info,you can check the file reference section above.

**Using the same `serverless.yml` file:** You can store your variables in `serverless.yml` if they don't contain sensitive data, and then reference them elsewhere in the file using `self:someProperty`. For more info, you can check the self reference section above.

**Using environment variables:** You can instead store your variables in environment variables and reference them with `env.someEnvVar`. For more info, you can check the environment variable reference section above.

Now you don't need `serverless.env.yml` at all, but you can still use it if you want. It's just not required anymore. Migrating to the new variable system is easy and you just need to know how the new system works and make small adjustments to how you store & reference your variables.
