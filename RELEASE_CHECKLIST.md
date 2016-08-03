# Release checklist

This checklist should be worked through when releasing a new Serverless version.

## Pre-Release and testing
- [ ] Look through all open issues and PRs (if any) of that milestone and close them / move them to another
milestone if still open
- [ ] Look through all closed issues and PRs of that milestone to see what has changed
- [ ] Create a Serverless service (with some events), deploy and test it intensively
- [ ] Look through the milestone and test all of the new major changes
- [ ] Run "npm test"
- [ ] Run "npm run integration-test"

## Release to NPM
- [ ] Create a new branch to bump version in package.json
- [ ] Bump version, send PR and merge PR with new version to be released
- [ ] Go back to branch you want to release from (e.g. master or v1) and pull bumped version changes from Github
- [ ] Make sure there are no local changes to your repository (or reset with `git reset --hard HEAD`)
- [ ] Create a git tag with the version (`git tag <VersionName>`)
- [ ] Push the git tag (`git push origin <VersionName>`)
- [ ] Check package.json Version config to make sure it fits what we want to release. *DO THIS, DON'T SKIP, DON'T BE LAZY!!!*
- [ ] Update Segment.io key (never push the key to GitHub and revert afterwards with `git checkout .`)
- [ ] Log into npm (`npm login`)
- [ ] Publish to NPM (`npm publish —-tag <TagForInstall>`, e.g. `npm publish --tag beta` or `npm publish` to release latest production framework)
- [ ] Validate NPM install works (`npm install -g serverless@<TagForInstall>` or `npm install -g serverless` if latest is released)
- [ ] Close milestone on Github
- [ ] Create a new release in GitHub for Release Notes
