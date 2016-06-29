# Installation

Let's start by installing Node.js and Serverless.

## Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to install Node.js on your
machine.

Go to the official [Node.js website](https://nodejs.org), download and follow the
[installation instructions](https://nodejs.org/en/download/) to install Node.js on your local machine.

**Note:** Serverless runs on Node v4 or higher. So make sure that you pick a recent Node version.

You can verify that Node.js is installed successfully by runnning `node --version` in your terminal. You should see the
corresponding Node version number printed out.

## Installing Serverless

Great! Now we've got everything in place to install Serverless. Serverless can be easily installed via
[npm](https://npmjs.org) which was installed alongside Node.js.

Open up a terminal and type `npm install -g serverless@alpha` to install the alpha version of Serverless.

Once the installation process is done you can verify that Serverless is installed successfully by running
`serverless --version`. You should see version 1.0.0 printed out on the terminal!

## Conclusion

We've just installed Node.js and Serverless on our local machine! The next step is to configure our cloud provider
account so that Serverless can act on our behalf and create resources for us on the cloud providers infrastructure.

[Next step > Provider account setup](provider-account-setup.md)
