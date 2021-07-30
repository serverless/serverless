<!--
title: Hello World Python Example
menuText: Python
description: Create a Python Hello World Lambda function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/examples/hello-world/python/)

<!-- DOCS-SITE-LINK:END -->

# Hello World Python Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

Once installed the Serverless CLI can be called with `serverless` or the shorthand `sls` command.

```
$ sls

Commands
* You can run commands with "serverless" or the shortcut "sls"
* Pass "--verbose" to this command to get in-depth plugin info
* Pass "--no-color" to disable CLI colors
* Pass "--help" after any <command> for contextual help
```

## 1. Create a service

```
sls create --template aws-python3 --path myService
```

Using the `create` command we can specify one of the available [templates](https://serverless.com/framework/docs/providers/aws/cli-reference/create#available-templates). For this example use aws-python with the `--template` or shorthand `-t` flag.

The `--path` or shorthand `-p` is the location to be created with the template service files. Change directories into this new folder.

## 2. Deploy

```
sls deploy
```

This will deploy your function to AWS Lambda based on the settings in `serverless.yml`.

## 3. Invoke deployed function

```
sls invoke -f hello
```

Invoke deployed function with command `invoke` and `--function` or shorthand `-f`.

In your terminal window you should see the response from AWS Lambda.

```bash
{
    "statusCode": 200,
    "body": "{\"message\":\"Go Serverless v1.0! Your function executed successfully!\",\"input\":{}}"
}
```

Congrats you have deployed and ran your Hello World function!
