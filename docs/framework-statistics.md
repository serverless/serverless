<!--
title: Serverless framework statistics
menuText: Framework statistics
layout: Doc
-->

# Framework statistics

Serverless will automatically collect anonymous framework statistics. This is done so that we better understand the usage and needs
of our users to improve Serverless in future releases. However you can always [disable it](#how-to-disable-it).

## What we collect

Our main goal is anonymity. All the data is anonymized and won't reveal who you are or what the project you're working on is / looks like.

Please take a look at the [`logStat()` method](../lib/classes/Utils.js) in the `Utils` class to see what (and how) we collect statistics.

## How it's implemented

We encourage you to look into the source to see more details about the actual implementation.

The whole implementation consists of two parts:

1. The [slstats plugin](../lib/plugins/slstats)
2. The `logStat()` method you can find in the [Utils class](../lib/classes/Utils.js)

## How to disable it

You can disable it by running the following command: `serverless slstats --disable`.
You can always run `serverless slstats --enable` to enable it again.
