<!--
title: Serverless Framework - Apache OpenWhisk Guide - Credentials
menuText: Credentials
menuOrder: 3
description: How to set up the Serverless Framework with your Apache OpenWhisk credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/credentials)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Credentials

The Serverless Framework needs access to account credentials for your OpenWhisk provider so that it can create and manage resources on your behalf.

OpenWhisk is an open-source serverless platform. This means you can either choose to run the platform yourself or choose to use a hosted provider's instance.

Here we'll provide setup instructions for both options, just pick the one that you're using.

## Register with IBM Cloud Functions

[IBM's Cloud platform](https://console.bluemix.net/) provides a hosted serverless solution ([IBM Cloud Functions](https://console.bluemix.net/openwhisk/)) based upon Apache OpenWhisk.

Here's how to get started…

- Sign up for a free account @ [IBM Cloud](https://console.bluemix.net/)

IBM Cloud comes with a [lite account](https://console.bluemix.net/registration/) that does not need credit card details to register. Lite accounts provide free access to certain platform services and do not expire after a limited time period.

**All IBM Cloud users get access to the [Free Tier for IBM Cloud Functions](https://console.ng.bluemix.net/openwhisk/learn/pricing). This includes 400,000 GB-seconds of serverless function compute time per month.**

Additional execution time is charged at \$0.000017 per GB-second of execution, rounded to the nearest 100ms.

### Install the IBM Cloud CLI

Following the [instructions on this page](https://console.bluemix.net/docs/cli/index.html#overview) to download and install the IBM Cloud CLI.

_On Linux, you can run this command:_

```
curl -fsSL https://clis.ng.bluemix.net/install/linux | sh
```

_On OS X, you can run this command:_

```
curl -fsSL https://clis.ng.bluemix.net/install/osx | sh
```

### Install the IBM Cloud Functions Plugin

```
ibmcloud plugin install Cloud-Functions -r Bluemix
```

### Authenticate with the CLI

Log into the CLI to create local authentication credentials. The framework plugin automatically uses these credentials when interacting with IBM Cloud Functions.

```
ibmcloud login -a <REGION_API> -o <INSERT_USER_ORGANISATION> -s <SPACE>
```

**Replace `<..>` values with your [platform region endpoint, account organisation and space](https://console.bluemix.net/docs/account/orgs_spaces.html#orgsspacesusers).**

For example....

```
ibmcloud login -a api.ng.bluemix.net -o user@email_host.com -s dev
```

After logging into the CLI, run the following command to populate the `~/.wskprops` file with credentials needed to run `serverless` commands:

```
ibmcloud wsk property get --auth
```

#### Regions

Cloud Functions is available with the following regions US-South (`api.ng.bluemix.net`), London (`api.eu-gb.bluemix.net`), Frankfurt (`api.eu-de.bluemix.net`). Use the appropriate [API endpoint](https://console.bluemix.net/docs/overview/ibm-cloud.html#ov_intro_reg) to target Cloud Functions in that region.

#### Organisations and Spaces

Organisations and spaces for your account can be viewed on this page: [https://console.bluemix.net/account/organizations](https://console.bluemix.net/account/organizations)

Accounts normally have a default organisation using the account email address. Default space name is usually `dev`.

_After running the login command, authentication credentials will be stored in the `.wskprops` file under your home directory._

## Register with OpenWhisk platform (Self-Hosted)

Following the [Quick Start guide](https://github.com/openwhisk/openwhisk#quick-start) will let you run the platform locally using a Virtual Machine.

- Download and install [Vagrant](https://www.vagrantup.com/) for your platform.
- Run the following commands to retrieve, build and start an instance of the platform.

```
# Clone openwhisk
git clone --depth=1 https://github.com/openwhisk/openwhisk.git

# Change directory to tools/vagrant
cd openwhisk/tools/vagrant

# Run script to create vm and run hello action
./hello
```

This platform will now be running inside a virtual machine at the following IP address: `192.168.33.13`

**Please note:** _If you are using a self-hosted platform, the `ignore_certs` property in `serverless.yaml` needs to be `true`. This allows the client to be used against local deployments of OpenWhisk with a self-signed certificate._

```yaml
service: testing
provider:
  name: openwhisk
  ignore_certs: true
functions: ...
```

### Access Account Credentials

The default environment has a guest account configured with the authentication key available here: https://github.com/openwhisk/openwhisk/blob/master/ansible/files/auth.guest

Use the `192.168.33.13` address as the `apihost` value needed below.

### (optional) Install command-line utility

Building OpenWhisk from a cloned repository will result in the generation of the command line interface in `openwhisk/bin/go-cli/`. The default executable in this location will run on the operating system and CPU architecture on which it was built.

Executables for other operating system, and CPU architectures are located in the following directories: `openwhisk/bin/go-cli/mac`, `openwhisk/bin/go-cli/linux`, `openwhisk/bin/go-cli/windows`.

Download and install the correct binary into a location in your [shell path](http://unix.stackexchange.com/questions/26047/how-to-correctly-add-a-path-to-path).

## Using Account Credentials

You can configure the Serverless Framework to use your OpenWhisk credentials in a few ways:

#### IBM Cloud Functions

After logging into the CLI, run the following command to populate the `~/.wskprops` file with credentials needed to run `serverless` commands:

```
ibmcloud wsk property get --auth
```

With this file available, the provider plugin will automatically read those credentials and you don't need to do anything else!

#### Environment Variables Setup

Access credentials can be provided as environment variables.

```bash
# mandatory parameters
export OW_AUTH=<your-key-here>
export OW_APIHOST=<your-api-host>
# optional parameters
export OW_APIGW_ACCESS_TOKEN=<your-access-token>
# OW_AUTH, OW_APIHOST and OW_APIGW_ACCESS_TOKEN are now available for serverless to use
serverless deploy
```

#### Using Configuration File

Credentials can be stored in a local configuration file, using either the CLI or manually creating the file.

##### Setup with the `wsk` cli

If you are using a self-hosted platform and have followed the instructions above to install the `wsk` command-line utility, run the following command to create the configuration file.

```bash
$ wsk property set --apihost PLATFORM_API_HOST --auth USER_AUTH_KEY
```

Credentials are stored in `~/.wskprops`, which you can edit directly if needed.

##### Edit file manually

The following configuration values should be stored in a new file (`.wskprops`) in your home directory. Replace the `PLATFORM_API_HOST`, `USER_AUTH_KEY` and (optionally) `ACCESS_TOKEN` values will the credentials from above.

```
APIHOST=PLATFORM_API_HOST
AUTH=USER_AUTH_KEY
APIGW_ACCESS_TOKEN==ACCESS_TOKEN # optional
```
