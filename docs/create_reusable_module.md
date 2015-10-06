# JAWS: Create reusable modules

Reusable AWSM modules can be distributed to the community by publishing an NPM
package. This guide is meant to help developers to get up & running with publishing
their own modules to NPM, Node's package manager. In the future, support for other platforms will be
added for which platform-specific guides will be written.

A typical NPM package will have the following structure:

```
/awsm
    /moduleName
        /functionName
/lib
    /something
awsm.json
```

The most important things to be aware of:

* The `/awsm` directory is meant as a scaffolding folder for [AWSM](https://github.com/awsm-org/awsm) modules.
  This means that the content of this folder will be replicated to the project's `aws_modules`
  folder once the module is installed. Be aware that updates to this folder in your package
  do not propagate to projects which have installed the module before, because the projects contain
  their own copy of the AWSM module.

* The `/lib` directory is the folder for your reusable and versioned code. This means
  the content of this folder cannot be touched by the implementer and will be
  automatically updated when you release a new module version.

An important thing to know is that you can only access your module's dependencies from
within the `lib` folder. This might sound as a limitation, but this is actually a good thing
since this enforces a clean separation of your module logic and implementation.

For a working example, have a look at the [awsm-images](https://github.com/awsm-org/awsm-images) module.

## Creating a new NPM module

The steps needed for creating your own NPM module:

* Create a new project directory (example: `/awsm-users`) for your module, outside of any existing project directories.

* Switch to the module directory, create `/awsm` and `/lib` directories and put your initial module files in there.

* Add a file called `awsm.json` in the root of the module with the following content:

  ```
  {
    "name": "awsm-users",
    "version": "0.0.1",
    "location": "https://github.com/...",
    "author": "",
    "description": "",
    "resources": {
      "cloudFormation": {
        "LambdaIamPolicyDocumentStatements": [],
        "ApiGatewayIamPolicyDocumentStatements": [],
        "Resources": {}
      }
    }
  }
  ```

  Replace the `name`, `location`, `author` and `description` attributes with the correct values.

* Run `npm init` to generate a [package.json](https://docs.npmjs.com/files/package.json) file.

* Install any dependencies by using `npm install --save <dependency>`. Same goes for devDependencies (use `--save-dev` here).

* Add the following `postinstall` configuration to the `scripts` section in `package.json` (don't forget to replace the module name):

  ```json
  {
    "scripts": {
      "postinstall" : "jaws postinstall <module-name> npm"
    }
  }
  ```

  This command will perform all tasks needed directly after installing the package, which are:
  * Trigger the replication of your `/awsm` directory to the project's `/aws_modules` directory
  * Merge the CloudFormation configuration into your project

* Run `npm link` to create a globally-installed symbolic link to your module. In case you run into permission problems, it might be needed to run this as a superuser (using `sudo` on Linux/OSX).

Now, your module is ready to be used in your local projects.

## Using the module in your projects

While you develop your module locally, it's pleasant to have a project to implement and test it in.
With the following steps, you can install the module in your project after which it can be tested.

* Switch to the project in which you want to install your NPM module.

* Run `npm link <module-name>` to create a link in your project's `/node_modules` directory to the globally-installed link.

* Run `jaws postinstall <module-name> npm` to execute the `postinstall` command (since `npm link` skips the `postinstall` script).

Now your module is installed!

Please note that the module is not yet published to the NPM registry and therefore not yet added to your project's package.json.
Read more about this in the NPM documentation on [publishing NPM packages](https://docs.npmjs.com/getting-started/publishing-npm-packages).
