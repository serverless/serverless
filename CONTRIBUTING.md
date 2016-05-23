We'd like to thank you in advance for your contributions to Serverless. This project wouldn't have been possible without awesome people like you. To get the best out of this community, please follow the following guidlines whenever you make a contribution:

## Pull Requests
Before you open a PR, please make sure you open an issue for it to discuss your changes first. This is just to ensure that your changes are within our roadmap and that your PR will be accepted and your efforts won't be wasted.

If your PR solves a specific open bug on our issue tracker or a feature request that we've decided to support, in that case opening a new issue is unnecessary. We just want to make sure we're aware of any work you'll be doing in advance so that we can help you along the way. Regardless of what you do, we appreciate you for just being in our community.

Once you start working on a PR, please follow our Testing and Code Style guidelines below. We can't accept your PR if it fails in any of these two critical areas. Whenever you make or update a PR, 3 checks fire on this PR from Travis-CI and Coveralls. If the builds fail, we can't accept your PR.

### Testing Guidelines
We're crazy about testing! we test everything and we aim for 100% test coverage. For test coverage, we use Istanbul locally, and coveralls on our main repo.

During development, please make sure your tests cover every single piece of code you write, you can easily check this coverage by opening the `index.html` file inside the `coverage` directory after you run the tests with `npm test`.

When you write unit tests, please follow our naming conventions for unit tests. Please include a top level `describe('ClassName')` block with the name of the class you're testing. Inside that `describe()` block, create another `describe('#methodOne()')` block for each method you have in your class.

For each method include a separate `it('should do something')` test case for each logical edge case in your new changes. After you write couple of tests, run the tests, check the code coverage and make sure all lines of code are covered, if not, just add more test cases that covers it. For reference and inspiration, please check our `tests` directory.

Make sure the description of the blocks matches the format you see here.

### Code Style Guidelines
Internally, we're using ESlint to check for codestyle issues using the airbnb preset. To stay consistent, please make sure you follow this codestyle carefully and that your changes doesn't have any styling issues. We can't accept your PR if your changes are not consistent with our code style.

You can check for styling issues in a file using ESlint using the following command: (in the root of our repo)

```
./node_modules/eslint/bin/eslint.js filename.js
```
You'll probably find ESlint plugins for your favorite code editor that will make this easier.

## Opening Issues
Before you open an issue, please make sure it's not a duplicate of an existing open (or closed) issue. A Github issue could be a feature request, a bug report, or simply a discussion about related topics. For support questions, please use StackOverflow with the `serverless` tag instead.

When you open an issue, we'll add relevant labels to that issue asap to reflect category, area of code, status and priority of the issue. We'll keep those labels updated to keep you updated on our progress. 

If your issue is a bug report, please make sure you include an accurate/detailed description of the issue you're facing and how to reproduce it. Make sure you mention your Serverless version, as well as your environment (node/npm version, OS...etc)

## Providing Support
This simplest thing you can do to help us move forward and make an impact on our progress is to simply provide support to other people having some difficulties with their Serverless project. You can do that by replying to issues on Github, or simply chatting with other community members on Gitter. Your very presence is enough to make us happy.

## Improving Documentation
Maintaining and updating the docs on a regular basis is a hard task. The more eyeballs on the docs the higher quality it'll get and the less chances there will be for typos and confusion. We keep our docs in our `serverless-docs` repo. If you see any issues with our docs, simply open an issue or a PR.

## Our Code of Conduct
Finally, to make sure you have a pleasant experience while being in our welcoming community, please read our [code of conduct](code_of_conduct.md). It outlines our core values and believes and will make working together a happier experience.

Thank you for being a part of our loving community!