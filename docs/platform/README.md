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

First, log in to the Serverless platform in via the CLI

```sh
$ sls login
```

After logging into the platform via the Serverless framework CLI every deploy will be published to the Serverless Platform.

Give it a try with a new service, or an existing service:

```sh
$ sls deploy
```

Then visit https://platform.serverless.com/ in your browser.


## Beta CLI Commands

Logging in to the platform enables access to beta features of the Serverless framework.

### [`sls run`](./commands/run.md)
Start local development mode for a Serverless service. This mode downloads and installs the [event-gateway](https://github.com/serverless/event-gateway) and the [serverless emulator](https://github.com/serverless/emulator). Both of these are used to emulate a serverless service and develop against them locally.

### [`sls emit`](./commands/emit.md)
Emit an event to an event-gateway.

### [`sls logout`](./commands/logout.md)
Logout of the platform.
