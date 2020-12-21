<!--
title: Resolution of environment variables
menuText: Resolution of environment variables
layout: Doc
-->

# Resolution of environment variables

With `useDotenv: true` set in your `serverless.yml` file, framework automatically loads environment variables from `.env` files with the help of [dotenv](https://www.npmjs.com/package/dotenv). In addition, `.env` files are excluded from the package when `useDotenv` is set in order to avoid uploading sensitive data as a part of package by mistake. Starting with next major version, `.env` files will be loaded by default and `useDotenv` setting will be ignored.

## Support for `.env` files

The framework looks for `.env` and `.env.{stage}` files in service directory and then tries to load them using `dotenv`. If `.env.{stage}` is found, `.env` will not be loaded. If stage is not explicitly defined, it defaults to `dev`.

### Differences against `serverless-dotenv-plugin`

There are a few differences between above functionality and [serverless-dotenv-plugin](https://github.com/colynb/serverless-dotenv-plugin):

- The framework only loads environments variables locally and does not pass them to your function's environment
- The framework loads variables from only one `.env` file (if stage-specific `.env` is found, default `.env` is not loaded)
- The framework does not support `.env.local`, `.env.{stage}.local`, and `.env.development` files in a similar way to the plugin
- The framework does not use `NODE_ENV` variable and `--env` flag when determining stage
