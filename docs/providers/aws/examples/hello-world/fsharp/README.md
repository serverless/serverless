<!--
title: Hello World F# Example
menuText: F#
description: Create a F# Hello World Lambda function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/examples/hello-world/fsharp/)

<!-- DOCS-SITE-LINK:END -->

# Hello World F# Example

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
sls create --template aws-fsharp --path myService
```

Using the `create` command we can specify one of the available [templates](https://serverless.com/framework/docs/providers/aws/cli-reference/create#available-templates). For this example use aws-fsharp with the `--template` or shorthand `-t` flag.

The `--path` or shorthand `-p` is the location to be created with the template service files. Change directories into this new folder.

## 2. Build using .NET Core 3.1.x CLI tools and create zip package

```
# Linux or Mac OS
./build.sh
```

```
# Windows PowerShell
./build.cmd
```

## 3. Deploy

```
sls deploy
```

This will deploy your function to AWS Lambda based on the settings in `serverless.yml`.

## 4. Invoke deployed function

```
sls invoke -f hello
```

Invoke deployed function with command `invoke` and `--function` or shorthand `-f`.

In your terminal window you should see the response from AWS Lambda.

```bash
{
    "Message": "Go Serverless v1.0! Your function executed successfully!",
    "Request": {
        "Key1": null,
        "Key2": null,
        "Key3": null
    }
}
```

Congrats you have deployed and ran your Hello World function!
