# Release process

## Semi-automation

Serverless Framework relies on [semantic commit messages](https://www.conventionalcommits.org/en/v1.0.0-beta.4/#summary) which allows to streamline the release process (versioning and changelog generation is automated)

See proposed [Commit Message Guidelines](https://docs.google.com/document/d/1hKUs3qt_aVp_PBI1UqvfaIqKma3jAJimEoGCRGGbOqs/edit#)

In PR's as coming from forks (community contributions) while its welcome, we do not require to follow semantic commit messages. Yet, such PR is expected to be squash merged by project member with a single semantic commit message.

PR's comming from branches have commit messages validated with [commmitlint](https://commitlint.js.org/#/)

## Release flow

Releases are triggered manually by preparing a release PRs

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
8. After PR is accepted by CI and one of the reviewers, merge it via _"Rebase and merge"_ option

_Further actions are automated in CI context:_

9. _`master` CI build detects that release PR was merged (by fact that it covers change of `version` field in `package.json` file). Having that (after successufl tests pass) version tag is created and pushed to the repository._
10. _Tag CI build publishes new version to npm, also it retrieves release notes from CHANGELOG.md and publishes them to GitHub._

### Updating release notes for already published versions

Improvements to release notes can be done at anytime to any already published version:

1. Update `CHANGELOG.md` with desired changes (ensure they'd also end in `master`)
2. Push updated release notes to GitHub by running:  
   `npx github-release-from-cc-changelog <version>`
