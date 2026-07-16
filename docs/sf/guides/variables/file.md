<!--
title: Serverless Framework - Variables - External Files
description: How to reference external YAML, JSON, JavaScript, and TypeScript files in serverless.yml
short_title: Serverless Variables - External Files
keywords: ['Serverless Framework', 'YAML', 'JSON', 'JavaScript', 'TypeScript', 'Configuration']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/file)

<!-- DOCS-SITE-LINK:END -->

# Reference YAML/JSON Files

You can reference properties in other YAML or JSON files. To reference properties in other YAML files use the `${file(./myFile.yml):someProperty}` syntax in your `serverless.yml` configuration file.

To reference properties in other JSON files use the `${file(./myFile.json):someProperty}` syntax. It is important that the file you are referencing has the correct suffix, or file extension, for its file type (`.yml` for YAML or `.json` for JSON) in order for it to be interpreted correctly.

Here's an example:

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

In the above example, you're referencing the entire `myCustomFile.yml` file in the `custom` property. You need to pass the path relative to your service directory. You can also request specific properties in that file as shown in the `schedule` property. It's completely recursive and you can go as deep as you want. Additionally you can request properties that contain arrays from either YAML or JSON reference files. Here's a YAML example for an events array:

```yml
myevents:
  - schedule:
      rate: rate(1 minute)
```

and for JSON:

```json
{
  "myevents": [
    {
      "schedule": {
        "rate": "rate(1 minute)"
      }
    }
  ]
}
```

In your `serverless.yml`, depending on the type of your source file, either have the following syntax for YAML:

```yml
functions:
  hello:
    handler: handler.hello
    events: ${file(./myCustomFile.yml):myevents}
```

or for a JSON reference file use this syntax:

```yml
functions:
  hello:
    handler: handler.hello
    events: ${file(./myCustomFile.json):myevents}
```

**Note:** If the referenced file is a symlink, the targeted file will be read.

## Reference JavaScript or TypeScript files

You can also reference values from JavaScript (`.js`, `.cjs`, `.mjs`) or TypeScript (`.ts`, `.mts`, `.cts`) modules. TypeScript modules are compiled on the fly with [tsx](https://tsx.is/) — the same mechanism the Framework uses to load `serverless.ts`, so no separate build step is required.

A module may export either a value or a function. Functions receive `{ options, resolveVariable, resolveConfigurationProperty }` and may be `async`. The property after `:` selects a named export.

```ts
// scripts/secrets.ts
export const getSecrets = async () => {
  return { apiKey: process.env.API_KEY }
}
```

```ts
// serverless.ts
import type { AWS } from '@serverless/typescript'

const serverlessConfiguration: AWS = {
  service: 'my-service',
  provider: { name: 'aws' },
  custom: {
    SECRETS: '${file(./scripts/secrets.ts):getSecrets}',
  },
  functions: {/* ... */},
}

export default serverlessConfiguration
```

The same works from `serverless.yml`:

```yml
custom:
  SECRETS: ${file(./scripts/secrets.ts):getSecrets}
```
