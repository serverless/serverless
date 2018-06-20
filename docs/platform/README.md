<!--
title: Serverless - Dashboard Documentation
menuText: Platform
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/platform)
<!-- DOCS-SITE-LINK:END -->

# Serverless Dashboard (Beta)

The Serverless Dashboard is currently in experimental beta. If you'd like to participate in the beta, simply follow the instructions below.

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

First, register or log in to the Serverless dashboard in via the CLI

```sh
$ serverless login
```

After logging into the dashboard, make a note of your tenant, and create a new application by clicking on "+ App" button in the applications page.

![Serverless Dashboard - Tenant](../../assets/tenant.png?raw=true "Serverless Dashboard - Tenant")
![Serverless Dashboard - Create Application](../../assets/tenant.png?raw=true "Serverless Dashboard - Create Application")

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

Now that you've logged in and added your tenant and app, every time you deploy, your service will be published **privately** to the Serverless Dashboard:

```sh
$ serverless deploy
```

Then visit https://dashboard.serverless.com/ in your browser to view and manage your service.
