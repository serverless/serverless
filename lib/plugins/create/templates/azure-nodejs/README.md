# Serverless Azure Functions Node.js Template

This starter template allows quickly creating a Node.js-based service to Azure Functions. It relies on the `serverless-azure-functions` plugin, and therefore, before you can deploy it, you simply need to run `npm install` in order to acquire it (this dependency is already saved in the `package.json` file).

### Setting up your Azure credentials

Once the `serverless-azure-functions` plugin is installed, it expects to find your Azure credentials via a set of well-known environment variables. These will be used to actually authenticate with your Azure account, so that the Serverless CLI can generate the necessary Azure resources on your behalf when you request a deployment (see below).

The following environment variables must be set, with their respective values:

- *azureSubId* - ID of the Azure subscription you want to create your service within
- *azureServicePrincipalTenantId* - ID of the tenant that your service principal was created within
- *azureServicePrincipalClientId* - ID of the service principal you want to use to authenticate with Azure
- *azureServicePrincipalPassword* - Password of the service principal you want to use to authenticate with Azure

For details on how to create a service principal and/or acquire your Azure account's subscription/tenant ID, refer to the [Azure credentials](https://serverless.com/framework/docs/providers/azure/guide/credentials/) documentation.

### Deploying the service

Once your Azure credentials are set, you can immediately deploy your service via the following command:

```shell
serverless deploy
```

This will create the necessary Azure resources to support the service and events that are defined in your `serverless.yml` file.

### Invoking and inspecting a function

With the service deployed, you can test it's functions using the following command:

```shell
serverless invoke -f hello
```

Additionally, if you'd like to view the logs that a function generates (either via the runtime, or create by your handler by calling `context.log`), you can simply run the following command:

```shell
serverless logs -f hello
```

### Cleaning up

Once you're finished with your service, you can remove all of the generated Azure resources by simply running the following command:

```shell
serverless remove
```

### Issues / Feedback / Feature Requests?

If you have any issues, comments or want to see new features, please file an issue in the project repository:

https://github.com/serverless/serverless-azure-functions
