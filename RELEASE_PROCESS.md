# Release Process

This document contains all the necessary information about out release process.

### Merge freeze

A "merge freeze" will be applied a few days before the release. This means that **NOTHING** will be added to the release branch.

A "merge freeze" ends once the release was published.

## Different types of releases

**Note:** More about versioning can be found in our dedicated [VERSIONING file](https://github.com/serverless/serverless/blob/master/VERSIONING.md).

Releases can come in different flavors. Here's a list with the most common release types and how they're treated

### Minor / Major release

The minor / major release is a planned release which includes all the changes added since the last minor / major release (including bugfixes). The user should pick up the latest minor / major release automatically when installing / updating Serverless.

The minor / major releases is released at a pre-defined time.

#### Versioning / tagging

Assuming our current version is `v1.1.0`.

The minor release would be `v1.2.0`. The major release would be `v2.0.0`.

### Patch release

Patch releases should **only** include critical bug fixes and released ASAP. The user should pick up the latest patch release automatically when installing / updating Serverless.

#### Versioning / tagging

Assuming our current version is `v1.1.0`.

The patch release would be `v1.1.1`.

### Alpha release

Alpha releases are created to have a sneak peek into the upcoming feature set of the new release. They're also used for pre-release QA / internal usage.

Alpha releases are not scheduled and can be pushed multiple times throughout a development phase.

Alpha releases should never be installed automatically when the user installs / updates Serverless. The user should be forced to explicitly name the alpha release during the installation / update phase (e.g. via `npm install --global serverless@alpha`).

#### Versioning / tagging

Assuming our current version is `v1.1.0`.

The alpha release would be `v1.2.0-alpha.1`. A subsequent alpha release would be `v1.2.0-alpha.2` etc.
