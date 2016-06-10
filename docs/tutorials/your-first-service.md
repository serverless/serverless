# Your first service

In this tutorial we'll create and use our very first Serverless service.
We'll create a new service, deploy it, invoke the first function and remove it afterwards.

We'll assume that you have Serverless v1.0 or greater installed on your machine.

Excited? Let's go.

## Creating a new service

`cd` into a directory of your choice and run `serverless create --name my-service --stage dev --region us-east-1`.
Serverless will create a skeleton for your new Serverless service.

Type `cd my-service` to navigate into the previously created directory.

## Open the service inside an editor

Open the directory with your favorite editor. You should see some files. One of those is the `serverless.yaml` file.
This file holds all the important information about your service. You should see e.g. a function definition.

You don't have to understand what's going on here as we'll go into more details about this file in upcoming tutorials.

## Deploying the service

Let's deploy our service by typing `serverless deploy --stage dev --region us-east-1`.

## Invoking your function

Next up we'll invoke the hello function from our service.
Run `serverless invoke --function hello --stage dev --region us-east-1` to tell Serverless that you want to run the function.

The function get's invoked and you should see a message on your console. Great! We've just executed our first function from
our first Serverless service!

## Removing the service

Let's remove our service entirely from our provider. This is pretty easy. Just run `serverless remove --stage dev
--region us-east-1` to remove everything.

The whole service is completely removed after this succeeds.

## Conclusion

Congratulations, you've just created, deployed, invoked and removed your very first serverless service!

You're interested to learn more about Serverless? Visit the [tutorials section](/docs/tutorials) to see other tutorials!
