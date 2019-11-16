<!--
title: Hello World Javas8 Example
menuText: Java8
description: Create a Java8 Hello World function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/)

<!-- DOCS-SITE-LINK:END -->

# Hello World Java8 Example

Make sure `serverless` is installed.

## 1. Create a service

`serverless create --template spotinst-java8 --path serviceName` `serviceName` is going to be a new directory there the Java8 template will be loaded. Once the download is complete change into that directory. Next you will need to install the Spotinst Serverless Functions plugin by running `npm install` in the root directory. You will need to go into the serverless.yml file and add in the environment variable that you want to deploy into. Also you need to copy the Service name in the serverless.yml file and paste it into the pom.xlm file under the finalName tag. Next you will have to package the project to create a .jar file. To do this run the command `mvn package`.

## 2. Deploy

```bash
 serverless deploy
```

## 3. Invoke deployed function

```bash
serverless invoke --function hello
```

In your terminal window you should see the response

```bash
{"hello":"null"}
```

Congrats you have deployed and ran your Hello World function!

## Short Hand Guide

`sls` is short hand for serverless cli commands

`-f` is short hand for `--function`

`-t` is short hand for `--template`

`-p` is short hand for `--path`
