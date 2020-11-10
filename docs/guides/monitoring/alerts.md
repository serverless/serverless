<!--
title: Serverless Dashboard - Alerts
menuText: Alerts
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/monitoring/alerts/)

<!-- DOCS-SITE-LINK:END -->

# Alerts

Serverless Insights include pre-configured alerts designed to help you develop and optimize the performance and security of your serverless applications. These events are presented in the "alerts" tab within the Serverless Framework [dashboard](https://app.serverless.com/). Preconfigured alerts include the following:

## Memory: Out of Memory

The out of memory alert is checked on every invocation of the function. If any invocation uses more memory than is configured for that function, Lambda will abruptly shut down the invocation and trigger an out of memory error. The alert will be triggered immediately and only once in a given 48 hour period.

## Memory: Unused Memory

The unused memory alert checks memory usage of functions and compares it to allocated memory to identify cases to lower the allocated memory to save cost on invocations. The unused memory alert check runs every hour and compares the maximum memory usage over the last 7 days with the allocated memory. If the number is below 80% of the allocated memory, then an alert will be triggered. The alert will show a proposed memory configuration as well as the amount of money which can be saved with the proposed configuration. It will only trigger once per function in each 7 day period.

## Error: New Error Type Identified

Errors happen, and the sooner you know about them after they are introduced the better equipped you are to proactively mitigate their impact.

On a per function and execution basis, the new error insight tracks error types reported (if any), and compares them with all error types reported over the prior 48 hours. An alert is generated when an error type is found that was not present during the prior 48 hours. From the activity and insights feed you are able to drill into the details of a specific occurrence of the new error type.

## Duration: Timeout

The timeout alert is checked on every invocation of the function. If any invocation runs for a duration longer than is configured for that function, Lambda will abruptly shut down the invocation and trigger a timeout error. The alert will be triggered immediately and only once in a given 48 hour period.

## Duration: Approaching Timeout

The approaching timeout alert runs every 5 minutes. It looks at the duration of all invocations of that function over the past 60 minutes. If any of the invocations exceed 90% of the configured timeout, then it will generate an alert. If an alert was already triggered in the past 60 minutes, a new alert will not be triggered.

## Duration: Unusual Function Duration

The unusual function duration is checked every 5 minutes. It looks at every invocation over the past 60 minutes and calculates the median duration. An alert is triggered If any of the invocations in the last 60 minutes had a duration that exceeded more than twice the median duration.

## Invocations: Escalated Invocation Count

An escalated invocation count can mean good things (e.g. more traffic) or bad things (e.g. higher costs or a runaway function). This alert helps you get out in front of both the good and the bad scenarios.

The escalated invocation count insight runs every five minutes and calculates the sum of invocations for a function over the prior five minutes. It then compares this most recent five minute invocation count against the highest five minute invocation count recorded during the prior 48 hours. If the most recent five minute invocation count is 25% greater than the highest five minute invocation count over the previous 48 hours an alert will be generated.
