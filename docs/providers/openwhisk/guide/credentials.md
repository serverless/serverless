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

# Credentials

The Serverless Framework needs access to account credentials for your OpenWhisk provider so that it can create and manage resources on your behalf. 

OpenWhisk is an open-source serverless platform. This means you can either choose to run the platform yourself or choose to use a hosted provider's instance.

Here we'll provide setup instructions for both options, just pick the one that you're using. 

## Register with OpenWhisk platform (IBM Bluemix)

IBM's Bluemix cloud platform provides a hosted serverless solution based upon Apache OpenWhisk.

Here's how to get started… 

- Sign up for a free account @ [https://bluemix.net](https://console.ng.bluemix.net/registration/)

IBM Bluemix comes with a [free trial](https://www.ibm.com/cloud-computing/bluemix/pricing?cm_mc_uid=22424350960514851832143&cm_mc_sid_50200000=1485183214) that doesn't need credit card details for the first 30 days. Following the trial, developers have to enrol using a credit card but get a free tier for the platform and services.

**All IBM Bluemix users get access to the [Free Tier for OpenWhisk](https://console.ng.bluemix.net/openwhisk/learn/pricing). This includes 400,000 GB-seconds of serverless function compute time per month.**

Additional execution time is charged at $0.000017 per GB-second of execution, rounded to the nearest 100ms.

### Access Account Credentials

Once you have signed up for IBM Bluemix, we need to retrieve your account credentials. These are available on [the page](https://console.ng.bluemix.net/openwhisk/learn/cli) about installing the command-line tool from the [service homepage](https://console.ng.bluemix.net/openwhisk/).

The second point in the instructions contains a command-line which includes the platform endpoint and authentication keys. 

```
wsk property set --apihost openwhisk.ng.bluemix.net --auth XXX:YYY
```

**Make a note of the `apihost` and `auth` command flag values.** 

### (optional) Install command-line utility

The command-line utility is linked from [the previous page](https://console.ng.bluemix.net/openwhisk/learn/cli). Download and install the binary into a location in your [shell path](http://unix.stackexchange.com/questions/26047/how-to-correctly-add-a-path-to-path). 



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

**Please note:** *If you are using a self-hosted platform, the `ignore_certs` property in `serverless.yaml` needs to be `true`. This allows the client to be used against local deployments of OpenWhisk with a self-signed certificate.* 

```yaml
service: testing
provider:
  name: openwhisk
  ignore_certs: true
functions:
  ...
```

### Access Account Credentials

The default environment has a guest account configured with the authentication key available here: https://github.com/openwhisk/openwhisk/blob/master/ansible/files/auth.guest

Use the `192.168.33.13` address as the `apihost` value needed below.

### (optional) Install command-line utility

Building OpenWhisk from a cloned repository will result in the generation of the command line interface in `openwhisk/bin/go-cli/`. The default executable in this location will run on the operating system and CPU architecture on which it was built. 

Executables for other operating system, and CPU architectures are located in the following directories: `openwhisk/bin/go-cli/mac`, `openwhisk/bin/go-cli/linux`, `openwhisk/bin/go-cli/windows`.

Download and install the correct binary into a location in your [shell path](http://unix.stackexchange.com/questions/26047/how-to-correctly-add-a-path-to-path). 



## Using Account Credentials

You can configure the Serverless Framework to use your OpenWhisk credentials in two ways:

#### Quick Setup

As a quick setup to get started you can export them as environment variables so they would be accessible to Serverless Framework:

```bash
export OW_AUTH=<your-key-here>
export OW_APIHOST=<your-api-host>
# OW_AUTH and OW_APIHOST are now available for serverless to use
serverless deploy
```

#### Using Configuration File

For a more permanent solution you can also set up credentials through a configuration file. Here are different methods you can use to do so.

##### Setup with the `wsk` cli

If you have followed the instructions above to install the `wsk` command-line utility, run the following command to create the configuration file. 

```bash
$ wsk property set --apihost PLATFORM_API_HOST --auth USER_AUTH_KEY
```

Credentials are stored in `~/.wskprops`, which you can edit directly if needed.

##### Edit file manually

The following configuration values should be stored in a new file (`.wskprops`) in your home directory. Replace the `PLATFORM_API_HOST` and `USER_AUTH_KEY` values will the  credentials from above.

```
APIHOST=PLATFORM_API_HOST
AUTH=USER_AUTH_KEY
```
