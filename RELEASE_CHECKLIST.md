# Release checklist

This checklist should be worked through when releasing a new Serverless version.

More info about our release process can be found in the [`RELEASE_PROCESS.md`](./RELEASE_PROCESS.md) document.

## Pre-Release

- [ ] Look through all open issues and PRs (if any) of that milestone and close them / move them to another
      milestone if still open
- [ ] Create a new branch for the release
- [ ] Bump the version number in `package.json`
- [ ] Run `./scripts/prs-since-last-tag <OLD-TAG>`
- [ ] Save the terminal output to your clipboard
- [ ] Close the milestone on GitHub
- [ ] Create a new [**draft** release](https://github.com/serverless/serverless/releases/new) in GitHub
  - [ ] Use the content in your clipboard as a description (without the heading)
  - [ ] Ensure that the "Tag version" follows our naming convention

## Prepare Package

- [ ] Install the latest `npm` version or Docker container with latest `node` and `npm` (Ensure to work with an `npm` version which is distributed with latest `node` version)
- [ ] Update `CHANGELOG.md` with the content from your clipboard
- [ ] Make sure all files that need to be pushed are included in `package.json -> files`
- [ ] Commit your changes (make sure that `package.json` and `CHANGELOG.md` are updated)
- [ ] Push your branch and open up a new PR
- [ ] Await approval and merge the PR into `master`
- [ ] Go back to the branch you want to release from (e.g. `master`) and pull the changes from GitHub
- [ ] Make sure there are no local changes to your repository (or reset with `git reset --hard HEAD`)
- [ ] Check `package.json` version config to make sure it fits what we want to release

## Releasing

- [ ] Publish the GitHub release draft (Travis CI will automatically publish the new release to `npm`)
- [ ] Update the branch ref in the site repo so docs are updated: https://github.com/serverless/site/blob/master/scripts/docs/config.js#L8

## Validate Release

- [ ] Validate that `npm install` works (`npm install -g serverless@<new-tag>` or `npm install -g serverless` if latest is released)
