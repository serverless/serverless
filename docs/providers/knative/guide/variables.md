<!--
title: Knative - Knative Guide - Variables | Serverless Framework
menuText: Variables
menuOrder: 9
description: How to use Serverless Variables to insert dynamic configuration info into your serverless.yml
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/variables/)

<!-- DOCS-SITE-LINK:END -->

# Knative Variables

Variables allow users to dynamically replace config values in `serverless.yml` config. They are especially useful when providing secrets for your service to use and when you are working with multiple stages.

The Serverless Framework provides a powerful variable system which allows you to add dynamic data into your `serverless.yml`. With Serverless Variables, you'll be able to do the following:

- Reference & load variables from environment variables via `${env:FOO}`
- Reference & load variables from CLI options via `${opt:stage}`
- Recursively reference properties of any type from the same `serverless.yml` file via `${self:provider.name}`
- Recursively reference properties of any type from other YAML / JSON files via `${file(./some-file.json):exportedVar}`
- Recursively nest variable references within each other for ultimate flexibility
- Combine multiple variable references to overwrite each other

**Note:** You can only use variables in `serverless.yml` property **values**, not property keys. So you can't use variables to generate dynamic logical IDs in the custom resources section for example.
