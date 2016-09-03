<!--
title: Installing Serverless
description: How to install Serverless
layout: Page
-->

# Installation

Let's start by installing Node.js and Serverless.

## Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to install Node.js on your
machine.

Go to the official [Node.js website](https://nodejs.org), download and follow the
[installation instructions](https://nodejs.org/en/download/) to install Node.js on your local machine.

**Note:** Serverless runs on Node v4 or higher. So make sure that you pick a recent Node version.

You can verify that Node.js is installed successfully by runnning `node --version` in your terminal. You should see the corresponding Node version number printed out.

## Installing Serverless

Great! Now we've got everything in place to install Serverless. Serverless can be easily installed via
[npm](https://npmjs.org) which was installed alongside Node.js.

Open up a terminal and type `npm install -g serverless` to install Serverless.

Once the installation process is done you can verify that Serverless is installed successfully by running `serverless --version`

## Provider Account Setup

In order for serverless to act on your behalf, you will need to connect your providers account. (AWS, Azure, etc.)

[AWS account Setup](../02-providers/aws/01-setup.md)

## Conclusion

We've just installed Node.js and Serverless on our local machine and configured our AWS account! Now lets create our first service.

[Next step > Creating Your First Service](./02-creating-services.md)
