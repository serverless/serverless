# Versioning

For the framework we _do not follow_ Semantic Versioning per se (as defined on [http://semver.org/](http://semver.org)).

However we ensure no breaking changes to be introduced with PATCH releases.

In `package.json` it is advised to reference a `serverless` dependency prefixed with a `~`, as e.g. `~1.44.1`. It allows PATCH updates but disallows MINOR updates which _may_ be breaking and MAJOR updates which are breaking.

## Intepretation of the version changes for the Framework

### PATCH

A release only containing backwards-compatible bug fixes. A bug fix in that sense is a reverting back functionality to what it has been there in the release before the last release. In case a feature doesn't work as expected, but has been there since a while and developers started to rely on it then it is not a bug fix, but a breaking change. If there is doubt if it's a bug fix or a breaking change fall back to breaking change.

#### Example of a Bug Fix

In version 1.2.0 we deployed a new version for every function. In 1.3.0 we stopped doing that, then a bug-fix release would bump the version 1.3.1

### MINOR

Release containing new functionality in a backwards-compatible manner, backwards-compatible bug fixes. So whenever a new CLI option is added, a new property exposed in the serverless object is passed to plugins this counts as new functionality.

A MINOR release may also contain design improvements to existing features, which may not be backwards-compatible. In such case release notes will contain precise information on breaking changes and explain migration steps.

#### Example of a new Feature

In version 1.2.0 no profile option for the CLI existed and it should be introduced in the next release. Then the next version will be 1.3.0.

#### Example of a Breaking Change

If we remove a helper function from the serverless object passed down to a plugin then this is a breaking change since some people might rely on it in custom made plugins.

##### Other cases of breaking changes that may be released with MINOR

- Any change to the CloudFormation output that changes the behaviour of existing infrastructure
- Any change to the CloudFormation output that prevents you to deploy over an existing stack
- Any CLI command being removed or changed
- Any option of all the existing CLI commands being removed or changed
- Any structural change in the CLI output
- Any object, property or function that is removed from the serverless object passed to plugins
- Remove an event from the list of lifecycle events of core commands
- Drop of support for no longer maintained major Node.js version (see [Node.js release schedule](https://github.com/nodejs/Release/blob/master/README.md))

##### What is considered a breaking change?

- Everything which touches the public facing API
  + CLI commands
  + CLI options
  + Methods accessible through `this.serverless`
  + ...
- Output Serverless produces
  + Files and their names
  + Transient data which is available during runtime
  + Formatted CLI outputs (e.g. via `--json`) **NOT:** standard outputs
  + ...


### MAJOR

Release containing a significant framwork upgrade that changes most of its functionalities or even drastically changes the framework design.

Breaking for all users of the framework.

### Node.js versions

The Serverless Framework supports the major cloud providers Node.js runtime versions. Support for old Node.js versions will be removed once Cloud providers announce that such runtimes are not supported anymore.

### FAQ

1. Is it okay to mark a feature as deprecated in version 1.4.0 and then remove it in 1.8.0

Yes, a breaking change to individual features may happen with a MINOR release

1. Can we change everything in a major version bump?

Yes, a new major will most likely announce a completely new (or significantly changed) framework architecture

1. Can we do a major version bump without a breaking change?

No, it won't happen

1. Why is CLI output a breaking change?

Right now we don't provide an option to output a well formated datastructure for a CLI command. Once we have such an option the default CLI output will not be part of the breaking changes list, but rather the datastructure. Also to note here if we add to that datastructure it will not be a breaking change. If we remove or change something from that datastructure it is a breaking change.
