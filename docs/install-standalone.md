<!--
title: Installing Serverless Framework as a standalone binary
layout: Doc
-->

# Installing Serverless Framework as a standalone binary

As explained in the [Setup](./getting-started.md) page, the recommended way to install Serverless Framework is via NPM.

If you don't want to install Node or NPM, you can install the `serverless` CLI as a standalone binary instead.

## MacOS/Linux

To install the latest version, run this command in your terminal:

```bash
curl -o- -L https://slss.io/install | bash
```

To install a specific version, you may set a `VERSION` variable, for example:

```bash
curl -o- -L https://slss.io/install | VERSION=2.72.2 bash
```

Then, open another terminal window to run the `serverless` program.

### Upgrade

On macOS/Linux, upgrade Serverless Framework to the latest version by running:

```bash
serverless upgrade

# You can also restrict the upgrade to the latest v2 version:
curl -o- -L https://slss.io/install | VERSION=2.72.2 bash
```

## Windows

Install Serverless Framework with [Chocolatey](https://chocolatey.org/):

```bash
choco install serverless
```

### Upgrade

On Windows, upgrade Serverless Framework to the latest version by running:

```bash
choco upgrade serverless
```

## Next steps

Now that Serverless Framework is installed, [get back to the Setup guide to create your first project](./getting-started.md#getting-started).
