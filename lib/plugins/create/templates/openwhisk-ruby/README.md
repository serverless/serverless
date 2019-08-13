# Serverless OpenWhisk Ruby Template

Hello! 😎

This is a template Ruby service for the OpenWhisk platform. Before you can deploy your service, please follow the instructions below…

### Have you set up your account credentials?

Before you can deploy your service to OpenWhisk, you need to have an account registered with the platform.

- _Want to run the platform locally?_ Please read the project's [_Quick Start_](https://github.com/openwhisk/openwhisk#quick-start) guide for deploying it locally.
- _Want to use a hosted provider?_ Please sign up for an account with [IBM Bluemix](https://console.ng.bluemix.net/) and then follow the instructions for getting access to [OpenWhisk on Bluemix](https://console.ng.bluemix.net/openwhisk/).

Account credentials for OpenWhisk can be provided through a configuration file or environment variables. This plugin requires the API endpoint, namespace and authentication credentials.

**Do you want to use a configuration file for storing these values?** Please [follow the instructions](https://console.ng.bluemix.net/openwhisk/cli) for setting up the OpenWhisk command-line utility. This tool stores account credentials in the `.wskprops` file in the user's home directory. The plugin automatically extracts credentials from this file at runtime. No further configuration is needed.

**Do you want to use environment variables for credentials?** Use the following environment variables to be pass in account credentials. These values override anything extracted from the configuration file.

- _OW_APIHOST_ - Platform endpoint, e.g. `openwhisk.ng.bluemix.net`
- _OW_AUTH_ - Authentication key, e.g. `xxxxxx:yyyyy

### Have you installed the provider plugin?

Install project dependencies which includes the OpenWhisk provider plugin.

```
$ npm install
```

**_…and that's it!_**

### Deploy Service

Use the `serverless` command to deploy your service. The sample `handler.js` file can be deployed without modification.

```shell
serverless deploy
```

### Issues / Feedback / Feature Requests?

If you have any issues, comments or want to see new features, please file an issue in the project repository:

https://github.com/serverless/serverless-openwhisk
