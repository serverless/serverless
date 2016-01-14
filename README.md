![Serverless Application Framework AWS Lambda API Gateway](other/img/serverless_framework_readme_large.gif)

Serverless Framework V0.1.0 (BETA)
=================================

####The Serverless Application Framework Powered By Amazon Web Services - [serverless.com](http://www.serverless.com)

Serverless is an application framework for building serverless web, mobile and IoT applications. Serverless comes in the form of a command line interface that provides structure, automation and optimization to help you build and maintain Serverless apps.

Serverless uses AWS services exclusively, since it relies on AWS's Lambda service to provide event-driven compute resources and many AWS services integrate nicely with Lambda. A Serverless app can be simply a group of lambda functions to accomplish some tasks, or an entire back-end comprised of hundreds of lambda functions.

We made a strong effort to make not just a groundbreaking Serverless framework, but the best framework for building applications with AWS in general (that is also Serverless!). As a result, Serverless incorporates years of AWS expertise into its tooling, giving you best practices out-of-the-box.

## Installing Serverless
You can install The Serverless Framework via npm: (requires Node V4)
```
npm install serverless -g
```

## Links
* [Documentation](http://docs.serverless.com/v0.1.0/docs/)
* [Road Map](https://trello.com/b/EX6SxBJJ/serverless)
* [Gitter Chatroom](https://gitter.im/serverless/serverless)
* [Stackoverflow](http://stackoverflow.com/questions/tagged/serverless)
* [Twitter](https://twitter.com/goserverless)
* [Serverless Meetups](http://www.meetup.com/serverless/)


## Plugins
Serverless is comprised of Plugins.  A group of default Plugins ship with the Framework, and here are some others you can add to improve/help your workflow:
* **[Plugin Boilerplate](https://github.com/serverless/serverless-plugin-boilerplate)** - Make a Serverless Plugin with this simple boilerplate.
* **[Serve](https://github.com/Nopik/serverless-serve)** - Simulate API Gateway locally, so all function calls can be run via localhost.
* **[Alerting](https://github.com/martinlindenberg/serverless-plugin-alerting)** - This Plugin adds Cloudwatch Alarms with SNS notifications for your Lambda functions.
* **[Optimizer](https://github.com/serverless/serverless-optimizer-plugin)** - Optimizes your code for performance in Lambda.

## Contributing
We love our contributors! If you'd like to contribute to the project, feel free to submit a PR. But please keep in mind the following guidelines:

* Propose your changes before you start working on a PR. You can reach us by submitting a Github issue, or discuss it in the [Gitter Chatroom](https://gitter.im/serverless/serverless). This is just to make sure that no one else is working on the same change, and to figure out the best way to solve the issue.
* If you're out of ideas, but still want to contribute, check out our [Road Map](https://trello.com/b/EX6SxBJJ/serverless). There's a lot we want to get done, and we'd love your help!
* Contributions are not just PRs! We'd be grateful for having you in our community, and if you could provide some support for new comers, that be great! You can also do that by answering [Serverless related questions on Stackoverflow](http://stackoverflow.com/questions/tagged/serverless).
* You can also contribute by writing. Feel free to let us know if you want to publish a useful original guide in our docs (attributed to you, thank you!) that you feel will help the community.
