# Release checklist

This checklist should be worked through when releasing a new Serverless version.

More info about our release process can be found in the [`RELEASE_PROCESS.md`](./RELEASE_PROCESS.md) document.

## Pre-Release

- [ ] Look through all open issues and PRs (if any) of that milestone and close them / move them to another
milestone if still open
- [ ] Look through all closed issues and PRs of that milestone to see what has changed. Run `./scripts/prs-since-last tag` or if you want to run against a specific tag `./scripts/prs-since-last tag v1.20.0` to get a list of all merged PR's since a specific tag
- [ ] Close milestone on GitHub
- [ ] Create a new draft release in GitHub

# Testing

- [ ] Create a Serverless service (with some events), deploy and test it intensively
- [ ] Look through the milestone and test all of the new major changes
- [ ] Run `npm test`
- [ ] Run `npm run simple-integration-test`
- [ ] Run `npm run complex-integration-test`

## Prepare Package

- [ ] Create a new branch to bump version in `package.json`
- [ ] Install the latest `npm` version or Docker container with latest `node` and `npm`
- [ ] Bump version in `package.json`, remove `node_modules` folder and run `npm install` and `npm prune --production && npm shrinkwrap`
- [ ] Look through closed PRs and update `CHANGELOG.md`
- [ ] Make sure all files that need to be pushed are included in `package.json -> files`
- [ ] Send PR and merge PR with new version to be released
- [ ] Add the changes you made to `CHANGELOG.md` to the description of the GitHub release draft
- [ ] Go back to branch you want to release from (e.g. `master`) and pull bumped version changes from GitHub
- [ ] Make sure there are no local changes to your repository (or reset with `git reset --hard HEAD`)
- [ ] Check `package.json`, `package-lock.json` and `npm-shrinkwrap.json` version config to make sure it fits what we want to release

## Releasing

- [ ] Publish the GitHub release draft (Travis CI will automatically publish the new release to `npm`)

## Validate Release

- [ ] Validate that `npm install` works (`npm install -g serverless@<new-tag>` or `npm install -g serverless` if latest is released)

## Post-Release

- [ ] Run `./scripts/generate-release-contributors-list <old-tag> <new-tag>` and hand the generated list over to the release blog post author
