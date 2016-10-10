<!--
title: Serverless Usage Tracking
menuText: Usage Tracking
layout: Doc
-->

# Usage tracking

Serverless will automatically track **anonymous usage data**. This is done so that we better understand the usage and needs
of our users to improve Serverless in future releases. However you can always [disable usage tracking](#how-to-disable-it).

## What we track

Our main goal is anonymity while tracking usage behavior. All the data is anonymized and won't reveal who you are or what
the project you're working on is / looks like.

### Command

Information about the command entered.

#### name

- String

The name of the command (e.g. `deploy` when you run `serverless deploy`).

#### isRunInService

- Boolean

If the command was run inside a Serverless service directory.

### Service

Service related information.

#### numberOfCustomPlugins

- Integer

How many custom plugins are used by the service.

#### hasCustomResourcesDefined

- Boolean

If the service uses custom resources with the help of the `resources.Resources` section.

#### hasVariablesInCustomSectionDefined

- Boolean

If variables are set with the help of the `custom` property.

#### hasCustomVariableSyntaxDefined

- Boolean

If a custom variable syntax is used to overwrite the default one.

### Provider

Provider specific information.

#### name

- String

The name of the provider the service should be deployed to (e.g. `aws`).

#### runtime

- String

Runtime of the services provider (e.g. `nodejs4.3`).

#### stage

- String

The stage the service is deployed to (e.g. `dev`).

#### region

- String

The region the service is deployed to (e.g. `us-east-1`).

### Functions

Information about the functions in the Serverless service.

#### numberOfFunctions

- Integer

How many functions are defined inside the service.

#### memorySizeAndTimeoutPerFunction

- Array

```
[
  {
    memorySize: 1024,
    timeout: 6
  },
  {
    memorySize: 47,
    timeout: 11
  }
]
```

The memory size and timeout combination for each function.

### Events

Information about event usage.

#### numberOfEvents

- Integer

Total number of events in the service.

#### numberOfEventsPerType

- Array

```
[
  {
    name: 'http',
    count: 2
  },
  {
    name: 's3',
    count: 1
  },
  {
    name: 'sns',
    count: 1
  }
]
```

How often the events are use throughout the service.

#### eventNamesPerFunction

- Array

```
[
  [
    'http',
    's3'
  ],
  [
    'http',
    'sns'
  ]
]
```

The events which are used gathered on a function level.

### General

General information about the usage.

#### userId

- String

A uuid to re-identify users and associate the data with the usage.

#### timestamp

- Integer

The timestamp taken when the command was run.

#### timezone

- String

The users timezone.

#### operatingSystem

- String

The users operating system.

#### serverlessVersion

- String

Version number of the Serverless version which is currently in use.

#### nodeJsVersion

- String

The Node.js version which is used to run Serverless.

## How tracking is implemented

**Note:** We encourage you to look into the source code to see more details about the actual implementation.

The tracking implementation consists of three parts:

1. The [tracking plugin](../lib/plugins/tracking)
2. A check if the `do-not-track` file is present in the [Serverless class](../lib/Serverless.js)
3. The `track()` method you can find in the [Utils class](../lib/classes/Utils.js)

### Tracking plugin

The whole purpose if this plugin is to create / remove a file called `do-not-track` in the installation directory of Serverless.
The `do-not-track` file is used to check whether Serverless should track the current usage or not.

The `do-no-track` file is created when you run `serverless tracking --disable`. It's removed when you run `serverless tracking --enable`.

### Checking for the `do-not-track` file

Serverless will check for the `do-not-track` file in the Serverless installation directory when the `run()` method is run.
The utils `track()` method is run if the `do-not-track` file is not present.

### Utils `track()` method

At first, Serverless will create a file called `tracking-id` in the root of the Serverless directory. This file contains a uuid
which is used to identify and associate the user when tracking information. The `tracking-id` file will be re-generated with a new
uuid if it's not present.

Next up, Serverless will read the uuid out of the existing file and gathers all the necessary tracking information ([see above](#what-we-track)
for more information).

Once everything is in place a `fetch` request (POST) is done to [Segment](http://segment.io) (the data store for all the tracking information).

This `fetch` request will timeout if it takes longer than 1 second to process. Furthermore it will resolve without throwing an error so that
the user will never suffer from having tracking enabled.

## How to disable it

You can disable usage tracking by running the following command: `serverless tracking --disable`.
You can always run `serverless tracking --enable` to enable tracking again.
