# Your first service

In this tutorial we'll create and use our very first Serverless service.
We'll create a new service, deploy it, invoke the first function and remove the whole service afterwards.

Our provider we use throughout the tutorial will be Amazon web services (AWS).

We'll assume that you have Serverless v1.0 or greater installed on your machine.

Excited? Let's go.

## Creating a new service

`cd` into a directory of your choice and run `serverless create --name my-service --provider aws`.
Serverless will create a skeleton for your new Serverless service inside the `my-service` directory.

Type `cd my-service` to navigate into the previously created directory.

## Open the service inside an editor

Open the directory with your favorite editor. You should see some files. One of those is the `serverless.yaml` file.
This file holds all the important information about your service. You should see e.g. a `functions` definition where
one function is defined.

You don't have to understand what's going on here as we'll go into more details about this file in upcoming tutorials.

## Deploying the service

Let's deploy our service by typing `serverless deploy`. You should see a prompt which informs you once the corresponding
resources are deployed to AWS.

## Invoking your function

Next up we'll invoke the `hello` function from our service (this example function was automatically created when we
initially created our service).

Run `serverless invoke --function hello --stage dev --region us-east-1` to tell Serverless that you want to run the function.

The function get's invoked and you should see a message on your console.

Great! We've just executed our first function from our Serverless service!

## Removing the service

Let's remove our service entirely from our provider. This is pretty easy. Just run `serverless remove --stage dev
--region us-east-1` to remove everything.

A prompt will inform you once everything is removed.

## Conclusion

Congratulations, you've just created, deployed, invoked and removed your very first Serverless service!

You're interested to learn more about Serverless? Visit the [tutorials section](/docs/tutorials) to see other tutorials!
