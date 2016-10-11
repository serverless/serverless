<!--
title: Recursive Function Invoke AWS Lambda Node Example
menuText: Recursive Invoke Example
description: Create a recursively invoking nodeJS Lambda function on amazon web services
layout: Doc
-->

# Recursive Lambda function Invocation

This function will recursively call itself 5 times specified from the `event.json` file

## Setup

Change the function ARN in the `config.json` file to your functions ARN, then invoke

## Invoking

```bash
sls invoke -f recursiveExample -p event.json
```

