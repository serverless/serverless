<!--
title: Serverless Framework - Spotinst Functions Guide - Introduction
menuText: Intro
menuOrder: 1
description: An introduction to using Spotinst Functions with the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/intro)
<!-- DOCS-SITE-LINK:END -->

# Spotinst - Permissions

Serverless functions can have to optional access permissions to either public or private. A public function is accessable from anywhere, while private access can only be triggered by authorized machines. 

The following is an example of how a private function would be set up in the serverless.yml file

```
	functions:
		hello:
			handler: heandler.main
			access: private
```
