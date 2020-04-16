# Versioning

For the framework we follow Semantic Versioning as defined on [http://semver.org/](http://semver.org).

## Interpretation of SemVer for the Framework

### PATCH

A release only containing backwards-compatible bug fixes. A bug fix in that sense is a reverting back functionality to what it has been there in the release before the last release. In case a feature doesn't work as expected, but has been there since a while and developers started to rely on it then it is not a bug fix, but a breaking change. If there is doubt if it's a bug fix or a breaking change fall back to breaking change.

#### Example of a Bug Fix

In version 1.2.0 we deployed a new version for every function. In 1.3.0 we stopped doing that, then a bug-fix release would bump the version 1.3.1

### MINOR

If a release adds functionality in a backwards-compatible manner and contains backwards-compatible bug fixes. So whenever a new CLI option is added, a new property exposed in the serverless object passed to plugins this counts as new functionality.

#### Example of a new Feature

In version 1.2.0 no profile option for the CLI existed and it should be introduced in the next release. Then the next version will be 1.3.0.

### MAJOR

Any non-backward compatible changes leads to a major version bump. This includes:

- Any change to the CloudFormation output that changes the behaviour of existing infrastructure
- Any change to the CloudFormation output that prevents you to deploy over an existing stack
- Any CLI command being removed or changed
- Any option of all the existing CLI commands being removed or changed
- Any structural change in the CLI output
- Any object, property or function that is removed from the serverless object passed to plugins
- Remove an event from the list of lifecycle events of core commands

#### What is considered a breaking change?

- Everything which touches the public facing API
  - CLI commands
  - CLI options
  - Methods accessible through `this.serverless`
  - ...
- Output Serverless produces
  - Files and their names
  - Transient data which is available during runtime
  - Formatted CLI outputs (e.g. via `--json`) **NOT:** standard outputs
  - ...

#### Example of a Breaking Change

If we remove a helper function from the serverless object passed down to a plugin then this is a breaking change since some people might rely on it in custom made plugins.

### Node.js versions

The Serverless Framework supports the major cloud providers Node.js runtime versions. Support for old Node.js versions will be removed once Cloud providers announce that such runtimes are not supported anymore.

### FAQ

1. Is it okay to mark a feature as deprecated in version 1.4.0 and then remove it in 1.8.0

No, since this is a breaking change it should trigger a major version bump to 2.0.0

2. Can we change everything in a major version bump?

Yes, this is the purpose of major version bumps. Ideally every breaking change has a clear and well documented migration path. In best case the features were already introduced earlier and upgrading is not a dealbreaker.

3. Can we do a major version bump without a breaking change?

No, as we strictly follow Semantic Versioning. The suggested strategy is to add features with minor releases and only do major version bumps when we take out deperecated features. Sometimes this is not possible, but as suggested above then a well documented migration path should come with the release.

4. Why is CLI output a breaking change?

Right now we don't provide an option to output a well formated datastructure for a CLI command. Once we have such an option the default CLI output will not be part of the breaking changes list, but rather the datastructure. Also to note here if we add to that datastructure it will not be a breaking change. If we remove or change something from that datastructure it is a breaking change.
