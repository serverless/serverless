# Overview

Currently the Serverless framework only offers lifecycle events that are bound to
commands and also are very coarse. Each core plugin only exposes the events that
are defined by the framework. This is suboptimal for plugin authors as they want to
hook special events within the deployment process.

The PR adds fine grained lifecycles to the AWS deployment process (see below for the
current implementation process) and makes the **package/deploy** plugin implementation
**non-breaking**.

The coarse lifecycle events are still available (so this is not breaking at all). Existing
and new plugins now have the opportunity to optimize their behavior and hook into the added
sub lifecycles. This should result in more stable plugins with less workarounds.

Of course core plugins can benefit the same way from the approach as external plugins.

## Non breaking nature

Is it? I think it is!

Implementing separated package / deploy commands without utilizing the new lifecycle models
would eventually have led to breaking all existing plugins and dependencies. The reason
for that is, that the lifecycle events with the old semantics are tightly bound to commands.

With the new model, the integration of the package and deploy commands can just be seamless,
as each command can spawn the well known lifecycles that are already used by plugins. This
guarantees that everyone who depends e.g. on `deploy:deploy` hooks will be triggered,
regardless, if the user run a packaged or full deploy.

### Commands / Invocations

#### Serverless deploy

The `serverless deploy` command is completely non-breaking. The complete serverless
internal state is kept along the package and deploy stages of the invocation.

Lifecycle events that have been moved to the package stage are redirected automatically
and tagged as deprecated (see below).

### Serverless package / deploy

The package command will, shortly said, store the Serverless service state and the deploy
command will reload it and continue with the loaded state. Plugins hooked into `before:deploy:deploy`
will have the same state as before the change and will continue to work as before. This also
applies to plugins that hooked `deploy:initialize`.

Although no adaption is enforced, the way is now open for all plugins to optimize their behavior and
split their processing explicitly between the build and deploy steps with upcoming versions. The old events have been deprecated.

For the detailed lifecycle exposure have a look [below](#lifecycle-events-outer-events-in-bold-complete-graph)

### Support for lifecycle event deprecation

Support for lifecycle event deprecation has been added. Events that will be removed
soon, should be flagged as deprecated. They will continue to work until they have
been completely removed, but the CLI will emit a warning for each plugin that
hooks a deprecated event. This enables us to introduce "soft" breaking changes
that let plugin authors time to switch to a new semantics.

It is important that the deprecated events are still functional, even if the
implementation of the command (e.g. deploy) switched to a new semantics. As long
as the events are not physically removed, the exposing plugin should handle
them in a meaningful way. In case of the deploy plugin the events are routed
to package and deploy commands that are quite similar to the prior event
locations.

In general, the addition of event deprecation enables all plugin authors (may it
be the Serverless team or external ones) to get rid of old implementations over
time and encourage people to adapt and use new technologies.

#### Declaring events as deprecated

To declare an event as deprecated, simply prefix it with `deprecated#` and optionally
add the new event that it will be redirected to with `->` at the end. This allows you
even to "redirect" deprecated events to completely different events in
different commands.

I know that this looks really ugly in the lifecycle array, but this is intentional.
Deprecation is a declaration to put an end to the event and not a nice label
(as some companies do it). It's a hard statement and your user should react or
die after some grace period!

## Grace period

The old deployment lifecycle events are marked as deprecated and will emit a
warning for every plugin that hooks to them. We should define a grace period
during that the deprecated events are redirected to the new semantics.

During this time plugin authors have to change their hooks to the new lifecycle
model.

After the grace period ends, the deprecated events will be removed from the
deploy plugin's `lifecycleEvents` array.

## Other providers (than AWS)

As other providers are implemented as plugins too, the use of the deprecated
events will be warned during the defined grace period.

Adapting the new lifecycle events should not be a big problem and is likely
done within a short timeframe. Optimally providers should also expose better
and more fine-grained lifecycles - examples can be found in the AWS
implementation.

### Tests done

I did quite a few tests with different project setups and plugins that are activated in the
serverless project. For testing I used one small sample project and a full fledged production
project we have.

#### Test 1: Plain sample project
OK
#### Test 2: Sample project with webpack
OK
#### Test 3: Sample project with webpack and alias plugin
OK - serverless deploy, severless package --package=out, serverless deploy --package=out
#### Test 4: Complex production project with webpack and alias plugin
NOT STARTED

## Common lifecycle events

Additionally to the better lifecycle event support within the existing commands, there are
some common AWS lifecycle events available now. An example is the validate which does validation
and preparation of the plugins (commonly included from `../lib/validate` by all plugins).

As you see in the full deploy lifecycle below, the deploy command now invokes the common validation
including its lifecycle, which leads to exposure and trigger of the aws:common:validate:validate
lifecycle event.

### Example

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

## Plugin authors

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

# Deploy

The AWS deploy command now exposes inner lifecycles that can be used by plugins to hook
at the right deployment step. Before it was just possible to hook on deploy:initialize,
deploy:deploy or deploy:finalize, so plugins could only hook BEFORE or AFTER the actual
deployment had been done. Plugins want more control over that, e.g. hook in, just before the
artifacts are uploaded to S3 to add their own files for example.

## Lifecycle events (outer events in bold, complete graph)

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

# Package

The package command runs through the first half of the former version 1.9.0 deploy command.
It builds the functions and events and finally creates the CF templates. These can be stored
as artifacts by a build server. Later on the artifacts can easily be processed further by using
the `deploy`command.

## Lifecycle events (outer events in bold, complete graph)

'cleanup',
'initialize',
'createDeploymentArtifacts',
'compileFunctions',
'compileEvents',
'packageService',
'finalize',

**package:cleanup**

    -> aws:common:validate:validate
    -> aws:common:cleanupTempDir

**package:initialize**

**package:createDeploymentArtifacts**

**package:compileFunctions**

**package:compileEvents**

**package:finalize**

    -> aws:package:finalize:mergeCustomProviderResources
    -> aws:package:finalize:saveServiceState

# Common

Common entrypoints can be called by plugins via `this.serverless.pluginManager.spawn()`.

Common entrypoint | Description
----------------- | -----------
aws:common:cleanupTempDir | Removes the Serverless temporary folder
aws:common:validate | Performs the global validation (../lib/validate)


## Hookable lifecycle events

### aws:common:cleanupTempDir:cleanup

  Triggered when the temporary '.serverless' directory is removed. Plugins can hook
  before to make sure they can access things the very last time (an example would be
  to generate or grab statistics from the directory).

### aws:common:validate:validate

  Triggered when any command executes the common AWS validate implementation. Allows
  plugins to hook after the Serverless validation and do plugin specific validation afterwards.
  There is no need to have plugins replicate the validation anymore.

# TODOS

* PluginManager
  * Unit tests for command deprecation
    * Check if deprecated commands are transformed to their normal form within events
    * Check if warning is emitted if the event is hooked
    * Check if deprecated events get triggered
    * Test deprecated event redirection
      * Redirected events should be triggered on the target event
      * Events without redirection should be triggered on the event itself
  * Unit tests for new spawn() call signature
    spawn() now accepts specifying commands as string ('cmd:subcmd:subcmd').
    We need a unit test for that.
* Deploy
  * Unit tests for extended validation
    * Check state restore and save
    * Check file exist checks

# Sample lifecycle implementation (AWS deploy)

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
      // Outer deploy lifecycle
      'deploy:initialize': () => this.serverless.pluginManager.spawn('aws:deploy:initialize'),

      'deploy:deploy': () => this.serverless.pluginManager.spawn('aws:deploy:deploy'),

      'deploy:finalize': () => this.serverless.pluginManager.spawn('aws:deploy:finalize'),

      // Deploy initialize inner lifecycle
      'aws:deploy:initialize:validate': () => this.serverless.pluginManager.spawn('aws:common:validate'),

      'aws:deploy:initialize:package': () => {
        if (!this.options.package) {
          return this.serverless.pluginManager.spawn('package');
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
