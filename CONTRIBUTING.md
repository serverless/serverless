# Contributing Guidelines

Welcome, and thanks in advance for your help!  Please follow these simple guidelines :)

## Pull Requests
Please follow these Pull Request guidelines when creating Pull Requests:
* If an Issue exists, mention in there that you are working on a solution.
* If an Issue does not exist, create a new Issue, detail your changes.  We recommend waiting until we accept it, so you don't waste your precious time.
* Follow our **Testing** and **Code Style** guidelines below.
* Squash multiple commits into a single commit via `git rebase -i`.
* Start commit messages with a lowercase verb such as "add", "fix", "refactor", "remove".
* Submit your PR and make sure the Travis-CI builds don't fail.
* Reference the issue in your PR.

## Issues
Please follow these Issue guidelines for opening Issues:
* Make sure your Issue is not a duplicate.
* Make sure your Issue is for a *feature request*, *bug report*, or *a discussion about a relevant topic*.  For everything else, please use StackOverflow with the `serverless` tag.
* Add the relevant Issue Label(s) and together we will keep them updated.

### Code Style
We aim for clean, consistent code style.  We're using ESlint to check for codestyle issues using the Airbnb preset. 

Please follow these Code Style guidelines when writing your unit tests:
* In the root of our repo, use this command to check for styling issues: `./node_modules/eslint/bin/eslint.js filename.js`
* There are likely ESlint plugins for your favorite code editor that will make this easier too!

### Testing
We aim for 100% test coverage, so make sure your tests cover as much of your code as possible.  For test coverage, we use Istanbul locally and Coveralls on our repo.  During development, you can easily check coverage by running `npm test`, then opening the `index.html` file inside the `coverage` directory.

Please follow these Testing guidelines when writing your unit tests:
*  Include a top-level `describe('ClassName')` block, with the name of the class you are testing.
*  Inside that top-level `describe()` block, create another `describe('#methodOne()')` block for each class method you might create or modify.
*  For each method, include an `it('should do something')` test case for each logical edge case in your changes.
*  As you write tests, check the code coverage and make sure all lines of code are covered.  If not, just add more test cases until everything is covered.
*  For reference and inspiration, please check our `tests` directory.

## Providing Support
The easiest thing you can do to help us move forward and make an impact on our progress is to simply provide support to other people having difficulties with their Serverless project. You can do that by replying to issues on Github, or simply chatting with other community members on Gitter. Your very presence is enough to make us happy.

## Improving Documentation
Maintaining and updating the docs on a regular basis is a hard task. The more eyeballs on the docs the higher quality it'll get and the less chances there will be for typos and confusion. We keep our docs in the `docs` folder in our main repo. If you see any issues with our docs, simply open an issue or a PR.

## Our Code of Conduct
Finally, to make sure you have a pleasant experience while being in our welcoming community, please read our [code of conduct](code_of_conduct.md). It outlines our core values and believes and will make working together a happier experience.

Thanks again for being a contributor to the Serverless Community!

Cheers,
The [Serverless](http://www.serverless.com) Team
