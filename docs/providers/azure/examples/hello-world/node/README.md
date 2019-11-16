<!--
title: Hello World Node.js Example
menuText: Node.js
description: Create a Node.js Hello World Azure function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/examples/hello-world/node/)

<!-- DOCS-SITE-LINK:END -->

# Hello World Node.js Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

Once installed the Serverless CLI can be called with `serverless` or the shorthand `sls` command.

```bash
$ sls

Commands
* You can run commands with "serverless" or the shortcut "sls"
* Pass "--verbose" to this command to get in-depth plugin info
* Pass "--no-color" to disable CLI colors
* Pass "--help" after any <command> for contextual help
```

## 1. Create a service

```bash
sls create --template azure-nodejs --path $(whoami)-sample-app
```

Using the `create` command we can specify one of the available [templates](https://serverless.com/framework/docs/providers/azure/cli-reference/create#available-templates). For this example we use azure-nodejs with the `--template` or shorthand `-t` flag.

The `--path` or shorthand `-p` is the location to be created with the template service files.

### Note

Azure plugin use a combination of:

- prefix, if provided
- service name
- region
- stage

to generate resource names. Since resource name have to be unique in Azure, adding `$(whoami)` will append your username to
the service name, thus creating a unique name.

---

## Install Provider Plugin

Change directories into the new folder created in previous step.

Run

```bash
npm install
```

---

## Testing Locally

You can skip this section if you do not want to test your functions locally
before deploy.

### Terminal 1

```bash
sls offline
```

### Terminal 2

```bash
sls invoke local -f hello -d '{"name": "Azure"}'
```

In your terminal window you should see the following response

```bash
$Serverless: URL for invocation: http://localhost:7071/api/hello?name%3DAzure
$Serverless: Invoking function hello with GET request
$Serverless: "Hello Azure"
```

---

## Deploy

```bash
sls deploy
```

---

## Invoke deployed function

1. Invoke deployed function with command `invoke` and `--function` or shorthand `-f`.

   ```bash
   sls invoke -f hello -d '{"name": "Azure"}'
   ```

1. In your terminal window you should see the response from azure

   ```bash
   $Serverless: Logging into Azure
   $Serverless: Using subscription ID: A356AC8C-E310-44F4-BF85-C7F29044AF99
   $Serverless: URL for invocation: http://{baseURL}.azurewebsites.net/api/hello?name%3DAzure
   $Serverless: Invoking function hello with GET request
   $Serverless: "Hello Azure"
   ```

Congrats you have deployed and ran your Hello World function!
