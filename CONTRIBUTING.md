# Contributing Guidelines

Welcome, and thanks in advance for your help! Please follow these simple guidelines :+1:

# How to contribute to Serverless

## When you propose a new feature or bug fix

**Note:** Please make sure to write an issue first and get enough feedback before jumping into a Pull Request!

- Please make sure there is an open issue discussing your contribution
- If there isn't, please open an issue so we can talk about it before you invest time into the implementation
- When creating an issue follow the guide that GitHub shows so we have enough information about your proposal

## When you want to work on an existing issue

**Note:** Please write a quick comment in the corresponding issue and ask if the feature is still relevant and that you want to jump into the implementation.

Check out our [help wanted](https://github.com/serverless/serverless/labels/help%20wanted) or [good first issue](https://github.com/serverless/serverless/labels/good%20first%20issue) labels to find issues we want to move forward on with your help.

We will do our best to respond/review/merge your PR according to priority. We hope that you stay engaged with us during this period to insure QA. Please note that the PR will be closed if there hasn't been any activity for a long time (~ 30 days) to keep us focused and keep the repo clean.

## Reviewing Pull Requests

Another really useful way to contribute to Serverless is to review other peoples Pull Requests. Having feedback from multiple people is really helpful and reduces the overall time to make a final decision about the Pull Request.

## Writing / improving documentation

Our documentation lives on GitHub in the [docs](docs) directory. Do you see a typo or other ways to improve it? Feel free to edit it and submit a Pull Request!

## Providing support

The easiest thing you can do to help us move forward and make an impact on our progress is to simply provide support to other people having difficulties with their Serverless projects.

You can do that by replying to [issues on Github](https://github.com/serverless/serverless/issues), chatting with other community members in [our Chat](http://chat.serverless.com) or helping with questions in [our Forum](http://forum.serverless.com).

---

# Code Style

We aim for clean, consistent code style. We're using ESlint to check for codestyle issues using the Airbnb preset.

## Verifying linting style

```
npm run lint
```

## Fixing lint issues

```
npm run lint:fix
```

To help reduce the effort of creating contributions with this style, an [.editorconfig file](http://editorconfig.org/) is provided that your editor may use to override any conflicting global defaults and automate a subset of the style settings.

# Testing

We aim for a (near) 100% test coverage, so make sure your tests cover as much of your code as possible.

## Test coverage

During development, you can easily check coverage by running `npm run coverage`, then opening the `index.html` file inside the `coverage` directory.

Please follow these Testing guidelines when writing your unit tests:

- Include a top-level `describe('ClassName')` block, with the name of the class you are testing
- Inside that top-level `describe()` block, create another `describe('#methodOne()')` block for each class method you might create or modify
- For each method, include an `it('should do something')` test case for each logical edge case in your changes
- As you write tests, check the code coverage and make sure all lines of code are covered. If not, just add more test cases until everything is covered
- For reference and inspiration, please check our `tests` directory

## Testing templates

If you add a new template or want to test a template after changing it you can run the template integration tests. Make sure you have `docker` and `docker-compose` installed as they are required. The `docker` containers we're using through compose are automatically including your `$HOME/.aws` folder so you can deploy to AWS.

To run all integration tests run:

```
./tests/templates/test-all-templates
```

To run only a specific integration test run:

```
tests/templates/integration-test-template TEMPLATE_NAME BUILD_COMMAND
```

so for example:

```
tests/templates/integration-test-template aws-java-maven mvn package
```

If you add a new template make sure to add it to the `test-all-templates` file and configure the `docker-compose.yml` file for your template.

# Our Code of Conduct

Finally, to make sure you have a pleasant experience while being in our welcoming community, please read our [code of conduct](CODE_OF_CONDUCT.md). It outlines our core values and believes and will make working together a happier experience.

Thanks again for being a contributor to the Serverless Community :tada:!

Cheers,

The :zap: [Serverless](http://www.serverless.com) Team
