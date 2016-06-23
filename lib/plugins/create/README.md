# Create

```
serverless create --name serviceName --provider providerName
```

Creates a new service in the current working directory.

## Options
- `--name` The name of your new service. **Required**.
- `--provider` The provider you want your service to deploy to. **Required**.

## Provided lifecycle events
- `create:create`

## Examples

### Creating a new service

```
serverless create --name myNewService --provider aws
```

This example will create a new service called `myNewService`. A new directory with the name `myNewService` will be created
in your current working directory. It contains the boilerplate necessary to operate your new service.

Your new service will have a default stage called `dev` and a default region inside that stage called `us-east-1`.
The provider which is used for deployment later on is AWS (Amazon web services).
