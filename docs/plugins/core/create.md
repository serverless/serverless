# Create

```
serverless create --name serviceName --stage dev --region us-east-1
```

Creates a new service in the current working directory.

## Options
- `--name` The name of your new service. **Required**.
- `--stage` The name of your first stage in service. **Required**.
- `--region` The name of your first region in stage. **Required**.

## Provided lifecycle events
- `create:create`

## Examples

```
serverless create --name serviceName --stage dev --region us-east-1
```

This example will create a new service called `serviceName`. A new directory with the name `serviceName` will be created
in your current working directory. It contains the boilerplate necessary to operate your new service.

Your new service will have a new stage called `dev` and a region inside that stage called `us-east-1`.
