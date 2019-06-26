<!--
title: Serverless Framework - Spotinst Functions Guide - Active Versions
menuText: Active Versions
menuOrder: 9
description: How to set which versions to deploy
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/active-versions)

<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Active Versions

Every time you update your function, a new version is being created by default. Version numbers have a unique ID that starts at 0 and increments by one each update. Each function version is immutable and cannot be changed.

## Latest Version

The 'Latest' version refers to the most recent version created by the last update. Unless otherwise specified, all incoming traffic is routed to the latest version.

_Please note: the 'Latest' tag will point to a different version number each and every time you update your function._

Default configuration for activeVersions when a new function is created:

```yaml
activeVersions:
  - version: $LATEST
    percentage: 100.0
```

## Active Version

The 'Active' version can point to more than one version of your function, including 'Latest'. This allows you to distribute your incoming traffic between multiple versions and dictate what percentage is sent to each version.

For example, say you wanted to test a new version of your function to determine if it was production-ready. You could specify that 10% of the traffic be routed to that new version, and route the remaining 90% to the stable version. You can gradually route more traffic to the new version as you become more confident in its performance.

### Examples

```yaml
activeVersions:
  - version: $LATEST
    percentage: 100.0
```

100% of traffic will go to the most recently published update.

```yaml
activeVersions:
  - version: $LATEST
    percentage: 80.0
  - version: 2
    percentage: 20.0
```

80% of traffic goes to the most recently published update, and 20% goes to version 2.

```yaml
activeVersions:
  - version: 5
    percentage: 50.0
  - version: 3
    percentage: 25.0
  - version: 1
    percentage: 25.0
```

Traffic is split between versions 1. 3, and 5. Changes made to your latest version will not affect production traffic.

### Configure Active Version

You can configure active versions in the serverless.yml file, but you can also use the Spotinst Console to configure the versions without deploying a new update. In the event you would like to change your 'Active' version configuration without updating your function, you can use the 'Configure Active Version' action from the console and the API

- Console:

  1. Navigate to your function
  2. Click 'Actions'
  3. Select 'Configure Active Version'

- API: (update function)

```yaml
activeVersions:
  - version: $LATEST
    percentage: 70.0
  - version: 2
    percentage: 30.0
```

### Requirements

- The sum of all percentages must be 100%
- You can set up to two decimal digits in the percentage
- Changes made to the ratio using the Spotinst Console will be overwritten by the contents of activeVersions in your serverless.yml file.
