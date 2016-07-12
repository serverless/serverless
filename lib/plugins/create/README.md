# Create

```
serverless create --template aws-nodejs
```

Creates a new service in the current working directory based on the provided template.

## Options
- `--template` or `-t` The name of your new service. **Required**.

## Provided lifecycle events
- `create:create`

## Available Templates
- aws-nodejs

## Examples

### Creating a new service

```
serverless create --template aws-nodejs
```

This example will generate scaffolding for a service with `AWS` as a provider and `nodejs` as runtime. The scaffolding will be generated in the current working directory.

Your new service will have a default stage called `dev` and a default region inside that stage called `us-east-1`.
The provider which is used for deployment later on is AWS (Amazon web services).
