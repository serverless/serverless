<!--
title: Serverless Framework - Cloudflare Workers Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Cloudflare Workers with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/intro)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Introduction

The Serverless Framework helps you develop and deploy serverless applications using [Cloudflare Workers](https://www.cloudflare.com/products/cloudflare-workers/). It's a CLI that offers structure, automation, and best practices out-of-the-box, allowing you to focus on building sophisticated, event-driven, serverless architectures, comprised of [Functions](#functions) and [Events](#events). [One config file](#serverlessyml) directs where exactly this Worker will live, so you can modify code and have it re-built and re-deployed in moments. No visits to the browser required.

The Serverless Framework is different than other application frameworks because:

- It manages your code as well as your infrastructure
- It supports multiple languages

# Serverless.yml

The `serverless.yml` file is what molds the Worker(s) of your project. Using the [Serverless Cloudflare Workers plugin](https://github.com/cloudflare/serverless-cloudflare-workers), a `serverless.yml` will look like:

```yml
# serverless.yml
service:
  name: hello
  webpack: true | PATH_TO_CONFIG
  config:
    accountId: ${env:CLOUDFLARE_ACCOUNT_ID}
    zoneId: ${env:CLOUDFLARE_ZONE_ID}

provider:
  name: cloudflare

plugins:
  - serverless-cloudflare-workers

functions: ..
```

#### Services

A **Service** is the Serverless Framework's unit of organization. You can think of it as a project file, though you can have multiple services for a single application. It's where you define your Functions and the routes they will live on, all in one file entitled `serverless.yml`:

```yml
# serverless.yml
service:
  name: hello
  config:
    accountId: ${env:CLOUDFLARE_ACCOUNT_ID}
    zoneId: ${env:CLOUDFLARE_ZONE_ID}

provider:
  name: cloudflare

plugins:
  - serverless-cloudflare-workers

functions: ..
```

`name`: the project name which will prefix the function and script names that will show on Cloudflare as [script name](#name).

`config`:

- `accountId`: the account that _owns_ the zone that you wish to deploy Workers too. Note: this may not be the account ID you are signed in as, but will be the account ID you see in the URL once you've selected the zone

- `zoneId`: the zone desired to deploy Workers to

  To find your zoneId and accountId, please see [API documentation on resource IDs](https://api.cloudflare.com/#getting-started-resource-ids)

#### Provider

A Provider tells the serverless frame what cloud provider you are using, in this case Cloudflare.

```
provider:
  name: cloudflare
  stage: prod
  environment:
     SOME_KEY: some_info
```

`stage`: meant to be the stage of your project (`dev`, `prod`..). Will be used in the [`name`](#name) of the scripts on deployed to Cloudflare. If unset defaults to `dev`.

`environment`: variables that can be referenced in your throughout your worker scripts. These will get added to every function. If a [`function`](#function) defines the same variable, the function definition will overwrite the provider block definition.

`name`: the name of the cloud provider, in this case `cloudflare`

#### Functions

A Function is a Cloudflare Worker - a single script including its bindings, routes and other config. It's an independent unit of deployment, like a microservice. It's merely code, deployed on Cloudflare’s 155+ PoPs points of presence, that is most often written to perform a single job as a Worker script.

`serverless.yml`:

```yml
functions:
  bar:
    name: scriptName
    script: filename
    webpack: true
    environment:
      some_key: <some_value>
    resources: ...
    events: ...
```

`name`: overwrite the default name generated (e.g. replaces [`hello-foo-bar`](#name)) for the Worker script name

`script`: the path to the script from the current directory omitting the extension `.js`

`webpack`(_optional_): specifies what webpack operation to perform on this individual Worker script. See webpack

`environment`(_optional_) : any environment variables set as a global inside the script. See more in [Environment](#environment)

`resources`(_optional_) : see Resources below

`events`(_optional_) : Any routing for a Worker is configured here. See Events below

##### Webpack

[Webpack](https://webpack.js.org/) allows you to easily use multiple files or libraries and not worry about a complicated build pipeline.

For example in your script you can now use `import`:

```
import hello from './includeMe';
addEventListener('fetch', event => {
  event.respondWith(hello(event.request))
});
```

If your handler script looks like the above, the includeMe script will be packed into the final script on deployment. Learn more about how webpack works in [the documentation](https://webpack.js.org/concepts).

To get this working in your worker project, simply add `webpack: true | <config path>` under the functions that you wish to bundle. Webpack will run on these functions, bundle the resulting file to `/dist`, and deploy the bundled file in `/dist`.

It can accept a boolean or a string. Possible behaviors:

- `boolean`: will automatically bundle the function if set to "true" with the default webpack config. If false or omitted no bundling will occur.
- `string`: a function level webpack configuration in addition to a global webpack configuration. This helps you to process bundling different for an individual function than the global webpack config. Note the extension `.js` will be ignored. (e.g. `webpack.config`)

##### Environment

While Cloudflare Workers doesn't exactly offer environment variables, we can bind global variables to values, essentially giving the same capabilities. In your function configuration, add key value pairs in `environment`

```yaml
functions:
  myFunction:
    environment:
      MYKEY: value_of_my_key
      ANOTHER_KEY_OF_MINE: sweet_child_o_mine
  myOtherFunc:
    name: ${env:ANOTHER_KEY_OF_MINE}
```

Then in your script, you can reference `MYKEY` to access the value. Within the `serverless.yml`, you can reference the variables as well `${env: key`.

To add a variable to every function use `provider`.

##### Events

Anything that triggers a Cloudflare Worker to execute is regarded by the Framework as an **Event**.

```
    events:
    	- http:
          url: example.com/hello/user* #serverless invoke -f? fun1
          method: GET
```

Each event implements two behaviors:

`serverless deploy` will parse out all the `url`(s) from the events in a function and deploy routes all pointing to that specific script. The routes may contain wildcards `*`. You cannot have multiple routes that are identical. The routes must be paths for the the zone specified by `CLOUDFLARE_ZONE_ID`.

`serverless invoke <functionname>` will deploy your worker and run the HTTP request(s) specified by the `url` and `method` against this deployed worker. This is useful for defining specific hooks into your application for testing. To truly test your worker, you can run [`cURL`](https://curl.haxx.se/) against your domain since the Worker will be deployed.

##### name

On Cloudflare, every script will have a script-name. The plugin generates a name for you using the `service.name` `provider.stage` and `function` to compose a name `service-stage-foo`.

###Plugins

You can overwrite or extend the functionality of the Framework using **Plugins**.
Every `serverless.yml` can contain a `plugins:` property, which features multiple
plugins.

```yml
# serverless.yml
plugins:
  - serverless-cloudflare-workers
  - serverless-another-plugin
```

You can add our `serverless-cloudflare-workers` plugin to your project by running `npm install --save serverless-cloudflare-workers`.

- _`workers.dev` domains are not currently supported using Serverless, but you can track our progress on [this Github issue](https://github.com/cloudflare/serverless-cloudflare-workers/issues/36)._
