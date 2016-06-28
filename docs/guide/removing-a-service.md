# Removing a service

We're now reaching the end of our Serverless guide.

Let's recap what we've learned so far. We've created our first service, deployed it on our providers infrastructure,
invoked a function, added events to our function and custom resources to our service.

The last step we need to learn is how we can remove the whole service and clean everything up.

##  Removing our service

Removal is done with the help of the `remove` command. Just run `serverless remove` to trigger the removal process.

Serverless will start the removal and informs you about it's process on the console.
A success message is printed once the whole service is removed.

**Note:** The removal process will only remove the service on your providers infrastructure. The service directory will
still remain on your local machine so you can still modify and (re)deploy it to another stage, region or provider later
on.

## Conclusion

We've just removed the whole service from our provider with a simple `serverless remove` command.

## What's next?

Now that we've reached the end of the Serverless guide you might want to know what you should do next?
Here are some ideas you might want to pick up to further extend your Serverless knowledge and play around with it.

### Utilize existing APIs in your service

What about a Serverless service which talks to an existing API and shows you e.g.
[current stock market prices](http://www.google.com/finance/info?q=NASDAQ:AMZN). You could accomplish that by calling
the API in your function and returning the result. This way you could [invoke the function](invoking-a-function.md)
with the `invoke` command to get stock prices shown on your console.

### Build a simple CRUD service

Want to build a more advanced service? What about a CRUD implementation? For each functionality (create, read, update,
delete) you could create a single function which talks to a database (e.g. DynamoDB). You could then add
[HTTP events](overview-of-event-sources.md) to trigger your functions through an API.

### News delivered to your inbox

Want to be up do date but have not time to waste on news sites? What about getting a summary of news delivered to your
inbox on a daily basis? You could create a function with a [schedule event](overview-of-event-sources.md) which will
call the function once a day. The function can then grab the latest news from an external API and send an E-Mail
(e.g. with Amazon SES) to your inbox.
