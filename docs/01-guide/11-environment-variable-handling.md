<!--
title: Excluding files from packaging
menuText: Packaging Services
layout: Doc
-->

# Environment Variables in Serverless

Environment variables are a very important and often requested feature in Serverless. It is one of our highest priority features, but to implement it to the extent we want it to be available will take more time as of now. Until then you'll be able to use the following tools for different languages to set environment variables and make them available to your code.

## Javascript

You can use [dotenv](https://www.npmjs.com/package/dotenv) to load files with environment variables. Those variables can be set during your CI process or locally and then packaged and deployed together with your function code.

## Python

You can use [python-dotenv](https://github.com/theskumar/python-dotenv) to load files with environment variables. Those variables can be set during your CI process or locally and then packaged and deployed together with your function code.

## Java

For Java the easiest way to set up environment like configuration is through [property files](https://docs.oracle.com/javase/tutorial/essential/environment/properties.html). While those will not be available as environment variables they are very commonly used configuration mechanisms throughout Java.
