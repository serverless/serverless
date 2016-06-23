# Creating a service

`cd` into a directory of your choice and run `serverless create --name my-service --provider aws`.
Serverless will create a skeleton for your new Serverless service inside the `my-service` directory.

Type `cd my-service` to navigate into the previously created directory.

## Open the service inside an editor

Open the directory with your favorite editor. You should see some files. One of those is the `serverless.yaml` file.
This file holds all the important information about your service. You should see e.g. a `functions` definition where
one function is defined.

You don't have to understand what's going on here as we'll go into more details about this file in upcoming tutorials.
