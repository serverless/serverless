<!--
title: Serverless - Platform Documentation
menuText: Platform
layout: Doc
menuItems:
  - {menuText: emit, path: /framework/docs/platform/commands/emit/}
  - {menuText: login, path: /framework/docs/platform/commands/login/}
  - {menuText: logout, path: /framework/docs/platform/commands/logout/}
  - {menuText: run, path: /framework/docs/platform/commands/run/}
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/platform)
<!-- DOCS-SITE-LINK:END -->

# Serverless Platform (Beta)

The Serverless Platform is currently in experimental beta. If you'd like to participate in the beta, simply follow the instructions below.

## Set-Up

Make sure you have Node.js installed and run:

```sh
$ npm i serverless -g
```

Then, check the version to make sure you are using V1.20.0, or later:

```sh
$ serverless -v
```

## Usage

First, register or log in to the Serverless Platform in via the CLI

```sh
$ serverless login
```

After logging into the platform, make a note of your tenant, and create a new application by clicking on "+ App" button in the applications page.

![Serverless Platform - Tenant](../../assets/tenant.png?raw=true "Serverless Platform - Tenant")
![Serverless Platform - Create Application](../../assets/create-application.png?raw=true "Serverless Platform - Create Application")

After creating your serverless application, add this application and your tenant to your service `serverless.yml` file:


```yml
service: my-service

tenant: eahefnawy
app: my-app

provider:
  name: aws
  runtime: nodejs6.10

functions:
  hello:
    handler: handler.hello
    events:
      - hello.world
      - http:
          path: hello/world
          method: post
          cors: true
```

Now that you've logged in and added your tenant and app, every time you deploy, your service will be published **privately** to the Serverless Platform:

```sh
$ serverless deploy
```

Then visit https://dashboard.serverless.com/ in your browser to view and manage your service.

**Note:** If this is your first deployment since you logged in, the framework will auto-create a platform access key for you named "Framework" and save it in your `~/.serverlessrc` file. This access key is used for authentication when publishing your service.

## Beta CLI Commands

Logging in to the platform enables access to beta features of the Serverless framework.

### [`serverless run`](./commands/run.md)
Start local development mode for a Serverless service. This mode downloads and installs the [event-gateway](https://github.com/serverless/event-gateway) and the [serverless emulator](https://github.com/serverless/emulator). Both of these are used to emulate a serverless service and develop against them locally.

### [`serverless emit`](./commands/emit.md)
Emit an event to an event-gateway.

### [`serverless login`](./commands/login.md)
Register or log in to the platform.

### [`serverless logout`](./commands/logout.md)
Logout of the platform.
