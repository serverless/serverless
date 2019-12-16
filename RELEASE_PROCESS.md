# Release process

## Semi-automation

Serverless Framework relies on [semantic commit messages](https://www.conventionalcommits.org/en/v1.0.0-beta.4/#summary) which allows to streamline the release process (versioning and changelog generation is automated)

See proposed [Commit Message Guidelines](https://docs.google.com/document/d/1hKUs3qt_aVp_PBI1UqvfaIqKma3jAJimEoGCRGGbOqs/edit#)

In PR's as coming from forks (community contributions) while its welcome, we do not require to follow semantic commit messages. Yet, such PR is expected to be squash merged by project member with a single semantic commit message.

PR's comming from branches have commit messages validated with [commmitlint](https://commitlint.js.org/#/)

## Release flow

Releases are triggered manually by preparing a release PRs

### Regular minor releases

Contain new features, enhancements and non-critical bug fixes. Issued every two weeks

#### Preparation steps:

1. Create the `release` branch (should derive from current `master` state)
2. Bump version ranges of _all_ dependencies to latest supported versions (e.g. if latest version of a dependency is `2.3.5` and range in a `package.json` is `^2.2.4` then it should be updated to `^2.3.5`)  
   _Note: Unfortunately there seems no reliable utility to automate that (there's a [request at `npm-check-updates`](https://github.com/tjunnone/npm-check-updates/issues/581))  
   If you handle installation of dependencies through [npm-cross-link](https://github.com/medikoo/npm-cross-link#npm-cross-link) then [`--bump-deps`](https://github.com/medikoo/npm-cross-link#general-options) option will bump version ranges as expected_
3. Commit eventual dependency version updates with following commit message:  
   `chore: Bump dependencies`
4. Run `npm run prepare-release` command.  
   _It'll automatically bump version in `package.json` to expected one (by inspecting changes since previous release) and will generate new changelog entry._
5. Improve generated changelog entry in `CHANGELOG.md`:

   - Ensure to remove evenutal items that were already published with patch releases
   - Improve formatting and messages if applicable
   - Ensure that updated `CHANGELOG.md` follows prettier formatting

6. Commit `package.json` and `CHANGELOG.md` changes with following commit message:
   `chore: Release`  
   **Note: For automation purpose it is important that it's the last commit in the PR**
7. Push branch upstream and create a PR.  
   _Release PR's are automatically detected in CI by fact of `version` in `package.json` file being changed in last commit. In context of that build, existence of new version changelog entry (in `CHANGELOG.md`) is validated._
8. After PR is accepted by CI and one of the reviewers, merge it via _"Rebase and merge"_ option

_Further actions are automated in CI context:_

9. _`master` CI build detects that release PR was merged (by fact that it covers change of `version` field in `package.json` file). Having that (after successufl tests pass) version tag is created and pushed to the repository._
10. _Tag CI build publishes new version to npm, also it retrieves release notes from CHANGELOG.md and publishes them to GitHub._

### Fast releases

Usually about important bug-fixes or features that we wish to release immediately.

Contrary to regular releases, they derive from `release-fast-track` branch (not `master`).

`release-fast-track` branch is automatically updated to point released version right after it's published, that means that if release is held from `master`, **the `release-fast-track` history is rewritten**.

For that reason community PR's in all cases should be based against `master`. If we want to fast release a patch as proposed by a community. After it is merged into `master`, we need to cherry-pick it into a branch that derives from `release-fast-track` and prepare a release on top of that.

#### Preparation steps:

1. Ensure that PR which contains a fix intended to be immediately published, derives from `release-fast-track` branch and is based against it.
2. Run `npm run prepare-release` command in context pf a PR branch
   _It'll automatically bump version in `package.json` to expected one (by inspecting changes since previous release) and will generate new changelog entry._
3. Improve generated changelog entry in `CHANGELOG.md`:

   - Improve formatting and messages if applicable
   - If any updates were applied ensure that updated `CHANGELOG.md` follows prettier formatting

4. Commit `package.json` and `CHANGELOG.md` changes with following commit message:
   `chore: Release`  
   **Note: For automation purpose it is important that it's the last commit in the PR**
5. After PR is accepted by CI and one of the reviewers, merge it via _"Rebase and merge"_ option

_Further actions are automated in CI context:_

9. _`release-fast-track` CI build detects that release PR was merged (by fact that it covers change of `version` field in `package.json` file). Having that (after successful tests pass) version tag is created and pushed to the repository._
10. _Tag CI build, publishes new version to npm, also it retrieves release notes from CHANGELOG.md and publishes them to GitHub._

### Updating release notes for already published versions

Improvements to release notes can be done at anytime to any already published version:

1. Update `CHANGELOG.md` with desired changes (ensure they'd also end in `master`)
2. Push updated release notes to GitHub by running:  
   `npx github-release-from-cc-changelog <version>`
