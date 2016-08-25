# Documentation

Welcome to the Serverless v1.0 documentation.

## Quick start

Follow these simple steps to install the beta, create and deploy your first service, run your function and remove the service afterwards.

1. `npm install -g serverless@beta`
2. `mkdir my-first-service && cd my-first-service`
3. `serverless create --template aws-nodejs`
4. `serverless deploy`
5. `serverless invoke --function hello`
6. `serverless remove`

## Getting Started
- Links to gettings started sections

## How to contribute to Serverless

We love our community! Contributions are always welcomed!
Jump right into our [issues](https://github.com/serverless/serverless/issues) to join existing discussions or open up
new ones if you have a bug or want to improve Serverless.

Also feel free to open up [pull requests](https://github.com/serverless/serverless/pulls) which resolves issues!

You may also take a look at our [code of conduct](/code_of_conduct.md).


## Running in DEBUG mode
If you run into issues/errors while working with Serverless, we print a user-friendly error. However, when reporting bugs, it's often useful to output the stack trace and other important information. To set debug mode, make sure you set the environment variable `SLS_DEBUG` with the following command (if you're in Unix based system):

```
export SLS_DEBUG=*
```
