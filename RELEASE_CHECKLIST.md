# Release checklist

This checklist should be worked through when releasing a new Serverless version.

## Pre-Release
- [ ] Look through all open issues and PRs (if any) of that milestone and close them / move them to another
milestone if still open
- [ ] Look through all closed issues and PRs of that milestone to see what has changed. Run `./scripts/pr-since-last tag` or if you want to run against a specific tag `./scripts/pr-since-last tag v1.0.3` to get a list of all merged PR's since a specific tag
- [ ] Close milestone on Github
- [ ] Create a new release in GitHub for Release Notes (including breaking changes)

# Testing
- [ ] Create a Serverless service (with some events), deploy and test it intensively
- [ ] Run integration test repository against the current release
- [ ] Look through the milestone and test all of the new major changes
- [ ] Run "npm test"
- [ ] Run "npm run simple-integration-test"
- [ ] Run "npm run complex-integration-test"

## Prepare Package
- [ ] Create a new branch to bump version in package.json
- [ ] Install the latest NPM version or Docker container with latest Node and NPM
- [ ] Bump version in package.json, remove `node_modules` folder and run `npm install` and `npm prune --production && npm shrinkwrap`
- [ ] Update CHANGELOG.md (including breaking changes)
- [ ] Make sure all files that need to be pushed are included in `package.json -> files`
- [ ] Send PR and merge PR with new version to be released
- [ ] Go back to branch you want to release from (e.g. master or v1) and pull bumped version changes from Github
- [ ] Make sure there are no local changes to your repository (or reset with `git reset --hard HEAD`)
- [ ] Check package.json and npm-shrinkwrap.json version config to make sure it fits what we want to release. *DO THIS, DON'T SKIP, DON'T BE LAZY!!!*

## Git Tagging
- [ ] Create a git tag with the version (`git tag <VersionName>`: `git tag v1.0.0`)
- [ ] Push the git tag (`git push origin <VersionName>`)

## Segment Configuration
- [ ] Update Segment.io key in [segment.js file](https://github.com/serverless/serverless/blob/d31057239d232181128d978c392bdecbcb9fcf1b/lib/utils/segment.js#L7) (never push the key to GitHub and revert afterwards with `git checkout .`)
- [ ] Check twice if you've used the correct key (**if in doubt ask which one to pick!**)
- [ ] Run `./bin/serverless help` and filter for this new version in the Segment debugger to make sure data is sent to Segment for this new version

## Release to NPM
- [ ] Log into npm (`npm login`)
- [ ] Publish to NPM (`npm publish —-tag <TagForInstall>`, e.g. `npm publish --tag beta` or `npm publish` to release latest production framework)
- [ ] Update Alpha/Beta accordingly so they point to the latest release. If its an Alpha Release the Beta tag should point to the latest stable release. This way Alpha/Beta always either point to something stable or the highest priority release in Alpha/Beta stage (`npm dist-tag add serverless@<VERSION> alpha`, `npm dist-tag add serverless@<VERSION> beta`)

## Validate Release
- [ ] Validate NPM install works (`npm install -g serverless@<TagForInstall>` or `npm install -g serverless` if latest is released)
- [ ] Check Segment.com production data if events are coming in correctly with the new version
- [ ] Make sure you run `git checkout .` to revert adding Segment write key

## Post-Release
- [ ] Run `./scripts/generate-release-contributors-list <old-tag> <new-tag>` and hand the generated list over to the release blog post author
