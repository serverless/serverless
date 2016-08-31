# Documentation

Welcome to the Serverless v1.0 documentation.

Here you'll find all the necessary information you need to learn and understand Serverless.
It'll show you how you can build next generation Serverless applications. Furthermore we'll deep dive into the
internals of Serverless so that you know how it works and how you can extend and modify it!

## Quick start

Follow these simple steps to install the beta, create and deploy your first service, run your function and remove the
service afterwards.

1. `npm install -g serverless@beta`
2. `mkdir my-first-service && cd my-first-service`
3. `serverless create --template aws-nodejs`
4. `serverless deploy`
5. `serverless invoke --function hello`
6. `serverless remove`

## How to contribute to Serverless

We love our community! Contributions are always welcomed!
Jump right into our [issues](https://github.com/serverless/serverless/issues) to join existing discussions or open up
new ones if you have a bug or want to improve Serverless.

Also feel free to open up [pull requests](https://github.com/serverless/serverless/pulls) which resolves issues!

You may also take a look at our [code of conduct](/code_of_conduct.md).

## User documentation

- [Understanding Serverless and the configuration file](understanding-serverless)
  - [Serverless services and functions](understanding-serverless/services-and-functions.md)
  - [serverless.yml](understanding-serverless/serverless-yml.md)
  - [Serverless variables](understanding-serverless/serverless-variables.md)
- [How to build your Serverless services](guide)
  - [Installing Serverless](guide/installation.md)
  - [Provider account setup](guide/provider-account-setup.md)
  - [Creating a service](guide/creating-a-service.md)
  - [Deploying a service](guide/deploying-a-service.md)
  - [Invoking a function](guide/invoking-a-function.md)
  - [Viewing function logs](guide/viewing-function-logs.md)
  - [Event sources](guide/event-sources.md)
  - [Overview of available event sources](guide/overview-of-event-sources.md)
  - [Custom provider resources](guide/custom-provider-resources.md)
  - [Removing a service](guide/removing-a-service.md)
- [Using plugins](using-plugins)
  - [How to use additional plugins in your service](using-plugins/adding-custom-plugins.md)
  - [Plugins provided by Serverless](using-plugins/core-plugins.md)
- [Building plugins](developing-plugins)
  - [How to build your own plugin](developing-plugins/building-plugins.md)
  - [How to build provider integration with your plugin](developing-plugins/building-provider-integrations.md)
- [Service templates](service-templates)
- [Usage tracking](usage-tracking)
  - [Detailed information regarding usage tracking](usage-tracking/usage-tracking.md)

## Running in DEBUG mode
If you run into issues/errors while working with Serverless, we print a user-friendly error. However, when reporting bugs, it's often useful to output the stack trace and other important information. To set debug mode, make sure you set the environment variable `SLS_DEBUG` with the following command (if you're in Unix based system):

```
export SLS_DEBUG=*
```
