# Release process

## Semi-automation

Serverless Framework relies on [semantic commit messages](https://www.conventionalcommits.org/en/v1.0.0-beta.4/#summary) which allow to streamline the release process (versioning and changelog generation is automated)

See proposed [Commit Message Guidelines](https://docs.google.com/document/d/1hKUs3qt_aVp_PBI1UqvfaIqKma3jAJimEoGCRGGbOqs/edit#)

In PR's as coming from forks (community contributions) while its welcome, we do not require to follow semantic commit messages. Yet, such PR is expected to be squash merged by project members with a single semantic commit message.

PR's coming from branches have commit messages validated with [commmitlint](https://commitlint.js.org/#/)

## Release flow

Releases are triggered manually by preparing a release PRs

#### Preparation steps:

1. Create the `release` branch (should derive from the current `main` state)
2. Bump version ranges of _all_ dependencies to the latest supported versions (e.g. if the latest version of a dependency is `2.3.5` and the range in a `package.json` is `^2.2.4` then it should be updated to `^2.3.5`)  
   _Note: If can handle it with a tool like [ncu](https://github.com/raineorshine/npm-check-updates) (`ncu --target minor --upgrade`) or if you handle the installation of dependencies through [npm-cross-link](https://github.com/medikoo/npm-cross-link#npm-cross-link) then [`--bump-deps`](https://github.com/medikoo/npm-cross-link#general-options) option will bump version ranges as expected_
3. Commit eventual dependency version updates with the following commit message:  
   `chore: Bump dependencies`
4. Run `npm run prepare-release` command.  
   _It'll automatically bump the version in `package.json` to the expected one (by inspecting changes since the previous release) and will generate a new changelog entry._
5. Improve generated changelog entry in `CHANGELOG.md`:

   - Ensure to remove eventual items that were already published with patch releases
   - Improve formatting and messages if applicable (each entry should have an issue/pr, commit, and author associated with it)
   - Ensure that updated `CHANGELOG.md` follows prettier formatting

6. Commit `package.json` and `CHANGELOG.md` changes with the following commit message:
   `chore: Release`  
   **Note: For automation purpose, it must be the last commit in the PR**
7. Push branch upstream and create a PR.
8. After PR is accepted by CI and one of the reviewers, merge it via _"Rebase and merge"_ option

_Further actions are automated in CI context:_

9. _`main` CI build detects that release PR was merged (by fact that it covers change of `version` field in `package.json` file). Having that (after successful tests pass) version tag is created and pushed to the repository._
10. _Tag CI build publishes a new version to npm, also it retrieves release notes from CHANGELOG.md and publishes them to GitHub._

### Updating release notes for already published versions

Improvements to release notes can be done at any time to any already published version:

1. Update `CHANGELOG.md` with desired changes (ensure they'd also end in `main`)
2. Push updated release notes to GitHub by running:  
   `npx github-release-from-cc-changelog <version>`
