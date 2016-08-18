# Usage tracking

Serverless will automatically track anonymous usage data. This is done so that we better understand the usage and needs
of our users to improve Serverless in future releases. However you can always [disable usage tracking](#how-to-disable-it).

## What we track

Our main goal is anonymity while tracking usage behavior. All the data is anonymized and won't reveal who you are or what
the project you're working on is / looks like.

Here's a list about all the information we track:
- Entered command(s)
- Operating system
- Loaded plugins
- Serverless version
- Number of functions inside your service
- Total number of events inside your service
- Event types and how often they were defined
- Provider of your service
- If the command was executed inside a service

## How tracking is implemented

We encourage you to look into the source to see more details about the actual implementation.

The tracking implementation consists of two parts:

1. The [tracking plugin](/lib/plugins/tracking)
2. The `track` method you can find in the [Utils class](/lib/classes/Utils.js)

## How to disable it

You can disable usage tracking by running the following command: `serverless tracking --disable`.
You can always run `serverless tracking --enable` to enable tracking again.
