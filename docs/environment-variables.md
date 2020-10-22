<!--
title: Preloading environment variables
menuText: Preloading environment variables
layout: Doc
-->

# Preloading environment variables

The framework automatically loads environment variables from `.env` files with the help of [dotenv](https://www.npmjs.com/package/dotenv).

The framework looks for `.env` and `.env.{stage}` files in current directory and then tries to load them using `dotenv`. If found, `.env.{stage}` file will be loaded second, to ensure that it will override any environment variables also set in `.env` file. If stage is not explicitly defined, it defaults to `dev`.

**Note**: There are a few differences between above functionality and [serverless-dotenv-plugin](https://github.com/colynb/serverless-dotenv-plugin):

- the framework only loads environments variables locally and does not pass them to your functions' environment
- the framework does not support `.env.local`, `.env.{stage}.local`, and `.env.development` files in a similar way to the plugin
- the framework does not use `NODE_ENV` variable and `--env` flag when determining stage

Currently, in order to use that functionality, you have to set `useDotenv: true` in your `serverless.yml` file. Starting with next major version, it will be turned on by default.
