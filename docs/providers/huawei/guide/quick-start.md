# Huawei Cloud - Quick Start

This guide is designed to help you get started as quick as possible.


## Initial Setup

There are a few prerequisites you need to install and configure:
- [Install Node.js 14.x or later on your local machine](#install-nodejs-and-npm)
- [Install the Serverless Framework open-source CLI version 3.28.1 or later](#install-the-serverless-framework-open-source-cli)

If you already have these prerequisites setup you can skip ahead to deploy an example Service.

### Install Node.js and NPM

- Follow these [installation instructions](https://nodejs.org/en/download/).
- At the end, you should be able to run `node -v` from your command line and get a result like this...

```sh
$ node -v
vx.x.x
```

- You should also be able to run `npm -v` from your command line and should see...

```sh
$ npm -v
x.x.x
```

### Install the Serverless Framework open-source CLI

- Run this command in your terminal

```sh
npm install -g serverless
```

- After install is complete, you should be able to run `serverless -v` from your command line and get a result like this...

```sh
$ serverless -v
x.x.x
```
##  Create and deploy a serverless Service
Now that you’ve completed your setup, let’s create and deploy a serverless Service.

### 1. Create a new service

1. Create a new service with the `huawei-nodejs` template

```bash
serverless create --template-url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs --path my-service
```

2. Install the dependencies

```bash
cd my-service
npm install
```

### 2. Set up the credentials

Read through [credentials doc](./credentials.md) to setup the credentials.

### 3. Update `serverless.yml`

Update the `region` and `credentials` in your projects `serverless.yml`

### 4. Deploy

Use this command to deploy your service for the first time and after you make changes to your Functions, Events or Resources in serverless.yml and want to deploy all changes within your Service at the same time.

Run the [deploy command](../cli-reference/deploy.md)

```bash
serverless deploy
```
