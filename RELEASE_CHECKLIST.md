# Release checklist

This checklist should be worked through when releasing a new Serverless version.

1. Update Segment.io key (never push the change to GitHub)
2. Look through all open issues and PRs (if any) of that milestone and close them / move them to another
milestone
3. Look through all closed issues and PRs of that milestone to see what has changed
4. Create a Serverless service (with some events), deploy and test it intensively
5. Look through the milestone and test all of the new major changes
6. Run "npm test"
7. Run "npm run integration-test"
8. Close milestone
9. Create a new release in GitHub (with corresponding changelog)
10. Publish new version on npm
