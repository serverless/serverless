<!--
title: Serverless Framework - Spotinst Functions Guide - Variables
menuText: Variables
menuOrder: 4
description: Different external variables and how to use them
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/credentials)
<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Variables

There are a few ways to introduce external variables to your serverless functions in order to customize each function call based on your personal needs. 

## Environment Variables

Environment variables allow you to pass static information into your function so you wont have to upload sensitive or protected information in your production code. It also allows you to easily change these variables from the outside so you do not have to upload your code multiple times with different variables. 

To enter your environment variables you will need to go into the Spotinst console find the function you want to add environment variables to. Then under the Configuration tab you will find the Environment Variables heading. Here you can enter as many variables you need all with an assoiated key.

To access your variables in your code you just need to put `process.env['{Your Key}']` as needed

## URL Argument Variables

URL parameters are useful if you want to enter data that could change based on user actions like filling out a form or entering information into a database. 

To access URL parameters in your code you just need to put `eq.query.{Your Parameter Name}` as needed
