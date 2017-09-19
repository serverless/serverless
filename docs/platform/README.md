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

First, register or log in to the Serverless platform in via the CLI

```sh
$ serverless login
```

After logging into the platform via the Serverless framework CLI every deploy will be published **privately** to the Serverless Platform. It allows you to view and share your deployed services.

Give it a try with a new service, or an existing service:

```sh
$ serverless deploy
```

Then visit https://platform.serverless.com/ in your browser.

**Note:** You can toggle auto-publishing by adding the `publish` config in `serverless.yml`:

```yml
service:
  name: my-service
  publish: false # disable auto-publishing
```

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
