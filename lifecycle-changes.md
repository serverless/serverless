Overview
========

Currently the Serverless framework only offers lifecycle events that are bound to
commands and also are very coarse. Each core plugin only exposes the events that
are defined by the framework. This is suboptimal for plugin authors as they want to
hook special events within the deployment process.

The PR adds fine grained lifecycles to the AWS deployment process (see below for the
current implementation process).

The coarse lifecycle events are still available (so this is not breaking at all). Existing
and new plugins now have the opportunity to optimize their behavior and hook into the added
sub lifecycles. This should result in more stable plugins with less workarounds.

Common lifecycle events
-----------------------

Additionally to the better lifecycle event support within the existing commands, there are
some common AWS lifecycle events available now. An example is the validate which does validation
and preparation of the plugins (commonly included from `../lib/validate` by all plugins).

As you see in the full deploy lifecycle below, the deploy command now invokes the common validation
including its lifecycle, which leads to exposure and trigger of the aws:common:validate:validate
lifecycle event.

Example:

A plugin needs to do custom validation of its very own parameters. It can now hook into
`after:aws:deploy:initialize:validate` to add its validation easily and possibly terminating
the process at the very right point if it encounters a validation error.

But this hook only works for the deploy command. What if the plugin also wants to run its
validator if any other command is run by the user?

The answer are the new common lifecycle events! If the plugin hooks `after:aws:common:validate:validate`
it will be called on any command that invokes the common validation. This makes sure that the plugin
can stop the command at the earliest convinience on errors. The current implementation of the
Serverless framework would let the stuff run, until finally the plugin gets called on `after:deploy:deploy`.
That's not acceptable from a user perspective nor from a plugin author's perspective.

Plugin authors
--------------

Plugin authors can use the same mechanism that is used in the AWS plugins to control
and expose their lifecycles.

As an example the new implementation of the AWS deploy plugin can be found below at the 
very end.

They even can use (spawn) the common lifecycles from `aws:common`. This is a win-win for
both, the plugin authors and Serverless. Why?

Use of the common lifecycles makes sure that a reliable implementation of Serverless is used.
The plugin author gets the guarantee that the functionality works and is updated and fixed properly,
the Serverless team gets the guarantee that plugin authors do not implement existing and working
things on their own, which might break existing functionality.

Deploy
======

The AWS deploy command now exposes inner lifecycles that can be used by plugins to hook
at the right deployment step. Before it was just possible to hook on deploy:initialize,
deploy:deploy or deploy:finalize, so plugins could only hook BEFORE or AFTER the actual
deployment had been done. Plugins want more control over that, e.g. hook in, just before the
artifacts are uploaded to S3 to add their own files for example.

Lifecycle events (existing events in bold, complete graph)
----------------------------------------------------------

**deploy:initialize**
  -> aws:deploy:initialize:validate
     -> aws:common:validate:validate
  -> aws:deploy:initialize:package
     -> package:package (if packaging is needed the package command lifecycle is spawned here)
  -> aws:deploy:initialize:validatePackage

**deploy:deploy**
  -> aws:deploy:deploy:createStack
  -> aws:deploy:deploy:uploadArtifacts
  -> aws:deploy:deploy:updateStack

**deploy:finalize**
  -> aws:deploy:finalize:cleanup

Package
=======

To be done ...

Common
======

Common entrypoints can be called by plugins via this.serverless.pluginManager.spawn().

Common entrypoint                          | Description
-------------------------------------------+----------------------------------------------------
aws:common:cleanupTempDir                  | Removes the Serverless temporary folder
aws:common:validate                        | Performs the global validation (../lib/validate)


Hookable lifecycle events

aws:common:cleanupTempDir:cleanup
---------------------------------
  Triggered when the temporary '.serverless' directory is removed. Plugins can hook
  before to make sure they can access things the very last time (an example would be
  to generate or grab statistics from the directory).

aws:common:validate:validate
----------------------------
  Triggered when any command executes the common AWS validate implementation. Allows
  plugins to hook after the Serverless validation and do plugin specific validation afterwards.
  There is no need to have plugins replicate the validation anymore.



Sample lifecycle implementation (AWS deploy):
```js
'use strict';

/*
 * serverless package => package in default .serverless dir
 * serverless package --package => package in custom path
 *
 * serverless deploy => package in default .serverless & deploy from default .serverless
 * serverless deploy --package => deploy from custom path
 */

const BbPromise = require('bluebird');
const extendedValidate = require('./lib/extendedValidate');
const monitorStack = require('../lib/monitorStack');
const createStack = require('./lib/createStack');
const setBucketName = require('../lib/setBucketName');
const cleanupS3Bucket = require('./lib/cleanupS3Bucket');
const uploadArtifacts = require('./lib/uploadArtifacts');
const updateStack = require('../lib/updateStack');

class AwsDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      extendedValidate,
      createStack,
      setBucketName,
      cleanupS3Bucket,
      uploadArtifacts,
      updateStack,
      monitorStack
    );

    // Define the internal lifecycle model
    this.commands = {
      aws: {
        type: 'entrypoint',     // This hides the command from the Serverless CLI
        commands: {
          deploy: {
            commands: {
              initialize: {
                lifecycleEvents: [
                  'validate',
                  'package',
                  'validatePackage',
                ],
              },
              deploy: {
                lifecycleEvents: [
                  'createStack',
                  'uploadArtifacts',
                  'updateStack',
                ],
              },
              finalize: {
                lifecycleEvents: [
                  'cleanup',
                ],
              },
            },
          },
        },
      },
    };

    this.hooks = {
      'deploy:initialize': () => this.serverless.pluginManager.spawn(
        ['aws', 'deploy', 'initialize']
      ),

      'deploy:deploy': () => this.serverless.pluginManager.spawn(
        ['aws', 'deploy', 'deploy']
      ),

      'deploy:finalize': () => this.serverless.pluginManager.spawn(
        ['aws', 'deploy', 'finalize']
      ),

      // Deploy initialize inner lifecycle
      'aws:deploy:initialize:validate': () => this.serverless.pluginManager.spawn(
        ['aws', 'common', 'validate']
      ),

      'aws:deploy:initialize:package': () => {
        if (!this.options.package) {
          return this.serverless.pluginManager.spawn(['package']);
        }
        return BbPromise.resolve();
      },

      'aws:deploy:initialize:validatePackage': () => BbPromise.bind(this)
        .then(this.extendedValidate),

      // Deploy deploy inner lifecycle
      'aws:deploy:deploy:createStack': () => BbPromise.bind(this)
        .then(this.createStack),

      'aws:deploy:deploy:uploadArtifacts': () => BbPromise.bind(this)
        .then(this.setBucketName)
        .then(this.uploadArtifacts),

      'aws:deploy:deploy:updateStack': () => BbPromise.bind(this)
        .then(this.updateStack),

      // Deploy finalize inner lifecycle
      'aws:deploy:finalize:cleanup': () => BbPromise.bind(this)
        .then(this.cleanupS3Bucket),

    };
  }
}

module.exports = AwsDeploy;
```