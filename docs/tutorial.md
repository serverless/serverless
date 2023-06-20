<!--
title: 'Tutorial: Your First Serverless Framework Project'
menuText: Your First Project
-->

# Tutorial: Your First Serverless Framework Project

<iframe width="700" height="394" src="https://www.youtube.com/embed/dMVfqCTzuwk" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

This guide helps you create and deploy an HTTP API with Serverless Framework and AWS.

We won't be going deep into the details behind why we are doing what we are doing; this guide is meant to help you get this API up and running so you can see the value of Serverless as fast as possible and decide from there where you want to go next. We will provide links to more details where appropriate if you want to dive deeper into specific topics.

You can [download this project](https://github.com/serverless/tutorial/tree/main/getting-started) on GitHub.

## Create an AWS account

The first thing we need to accomplish is to have somewhere to deploy to. Serverless development relies on cloud vendors to help get your applications onto the web as fast as possible and the most widely used vendor for this is AWS.

If you already have a verified AWS account you can use, then please skip ahead. Otherwise, you will need to go to the [AWS account creation page](https://portal.aws.amazon.com/billing/signup#/start) and follow the instructions for creating the account. The account will also need to be fully verified in order to be able to deploy our Serverless services.

## Installing Serverless Framework

Installing the Serverless Framework is, thankfully, very easy. Since it is an NPM module, it requires Node and NPM to be installed. In case you do not have them installed, you can find details on how to do so here for your preferred platform: https://nodejs.org/en/download/

With Node and NPM installed, it is recommended to install Serverless Framework as a global module. This can be done with:

```bash
npm install -g serverless
```

## Create a new service

In order to get started, we need to create our first service, and the Serverless Framework has a great way to help us get bootstrapped quickly and easily. In your CLI, just run the following command:

```bash
serverless
```

This will then start a wizard-like process to help you bootstrap a new service.

![img](https://assets-global.website-files.com/60acbb950c4d66d0ab3e2007/61f2c5537aaa4ac109b9b7e1_61f19876940e2064c1716616_px6lapq9CNkkO1sK71mgc0Mtudjo369IQzQnwHHn-nzCXnUSEeFv4ovmJI50ZFIPmsPfuK-A39OjujXE4nW3gj9D1tiWkLveg3PZLF9fz7mWtsQp3xzMZESpnP6KEaR5-asUh6AL.png)

## Using the `serverless` command

The first option you should see is to choose the type of template you want to base your service on. This is only to get you started and everything can be changed later if you so desire.

1. For our purposes in this Getting Started, let’s choose the option “AWS - Node.js - HTTP API”.
2. In the next step, feel free to name this new service whatever you wish or just press “Enter” to keep the default of aws-node-http-api-project
3. This will then create a new folder with the same name as in step 2 and also pull the template related to our choice
4. We are now prompted about whether we want to login or register for Serverless Dashboard.

## What is Serverless Dashboard?

[Serverless Dashboard](http://app.serverless.com) is a tool provided by the Serverless Framework to help make managing connections to AWS easier, manage configuration data for your services, monitoring capabilities and the ability to read logs for your Lambda functions amongst many other features.

The dashboard is free for single developer use and we will be using it for the purpose of the getting started, because the dashboard makes it so much easier to manage connections to our AWS account for the deployment we will shortly be doing.

For all these reasons, lets choose Y (or just press Enter), to get ourselves set up with the dashboard. This will then open a window in your browser.

Let's click the “Register” link near the bottom to create our account, either using GitHub, Google or your own email address and password. Clicking register, when prompted for a username, go ahead and use a unique username that contains only numbers and lowercase letters.

Once the account is created, the CLI will then do one of two things:

1. If you already have AWS credentials on your machine for some reason, you will get prompted to deploy to your AWS account using those credentials. I would recommend saying no at this point and checking out the next step “Setting up provider manually”
2. If you do not have AWS credentials on your machine, the CLI will ask you if you want to set-up an “AWS Access Role” or “Local AWS Keys”. Let's choose the AWS Access Role to continue for now.

![img](https://assets-global.website-files.com/60acbb950c4d66d0ab3e2007/61f2c552c28dcc79f3f80f05_61f1987653c42f714ad26aff_gUC-yZhdcWsu_vBv8GFQv6QlY15cpyWKgt7EbQ8CkiKGB88_02ITmfnLbBD3dgKygFoxWFEKVSoWsRiQszZfMYebIsmMrYig-8Q3_nURFLOBhaJA4fyC2jJZcWbabf4RjDGuPD_x.png)

When you choose “AWS Access Role” another browser window should open (if not, the CLI provides you a link to use to open the window manually), and this is where we configure our Provider within our dashboard account.

![img](https://assets-global.website-files.com/60acbb950c4d66d0ab3e2007/61f2c55319969220814ce2b7_61f198766d6b9c8fa8d6d1f7_xmNC49vOm8J4Y0xafU-3edJvkDSmmthrm4zFTFnGX3Ght03vHaiG41DodIXKBPIw_dWpuzSTb6uC8XQ6qWVz93oM6lA_F2ORGYOLgazshBUAkcsnrmEYKgZm8i32Q4PfGaojzeo1.png)

Feel free to read through the documentation you may see, and on the next step make sure to choose the “Simple” option and then click “Connect AWS provider”. This will open a page to your AWS account titled “Quick create stack”. There is nothing we need to change here, just scroll down so that we can check the confirmation box at the bottom of the page, then click “Create Stack”.

![img](https://assets-global.website-files.com/60acbb950c4d66d0ab3e2007/61f2c5536e2099d8789f8e51_61f19876fb7773f309babd62_dLslnDYmsFl77J11WwIGCh7_-A5YKMy-KSB-PCyf5E6FuvJKFdM8B8-19bPWqYRpvn45cddUFLPFraAHsqIdD_qbC_JHQ5xi8j-7U3xl5S1B2oIg1ltAR74UzS3mvd2O8Dj93aoM.png)

At this point we need to sit and wait a few seconds for AWS to create what’s needed, we can click the refresh button to the list on the left until the status says `CREATE_COMPLETE`.

![img](https://assets-global.website-files.com/60acbb950c4d66d0ab3e2007/61f2c5530e8a37e3fc5d9d8f_61f198761ad0e7703e31939f_5emBZ5ekR_hdYe1VSsB4d_K7DTConZQaECnBDniEbEaNneZ2eKpKX3aISLr9EmHVhntKPXSAsE82Ln-6m3HvSfuPju7CQOfoDyXTLaTkxMyupeJ4Ws62qQZ8LzyTtZ5LbVufOH7H.png)

Once that is done, you can close that tab to go back to the provider creation page on the dashboard. The dashboard should automatically detect that the provider created successfully, and so should the CLI. At this point, go ahead and reply "Y" to the question about deploying and we wait a few minutes for this new service to get deployed.

## Setting up a provider manually

If you already had AWS credentials on your machine and chose “No” when asked if you wanted to deploy, you still need to setup a Provider. Thankfully to get one setup is pretty easy. Go to app.serverless.com and register an account as described above. Then when you get through to the app listing page, click on “org” on the left, then choose the “providers” tab and finally “add”.

At this point adding your provider is exactly the same as described above, and once done, you can go back to your service in the CLI. Make sure to `cd` into the services folder then run `serverless deploy`. This will now use your Provider you created to deploy to your AWS account.

## Using local AWS credentials

Of course, if you don’t want to set-up a provider on a dashboard account, you can use local credentials setup on your own machine. This involves creating a user with the right permissions and adding the credentials on your machine. While we won’t cover how to do that in this guide, we have some [great documentation](https://www.serverless.com/framework/docs/providers/aws/guide/credentials#creating-aws-access-keys) on how to accomplish this.

## What have we just done?

After a successful deployment you should see, either in the dashboard or on the CLI, that you have an HTTP endpoint you can call. Also, if you open the service we just created in your favourite IDE or text editor and look at the contents of the `serverless.yml`, this is what controls pretty much everything in our service. You will notice a section where the functions you have are defined with events attached to them. Also take note that the code that executes when this HTTP endpoint is called is defined in the `index.js` file. If you edit this file then run `serverless deploy` your changes will be pushed to your AWS account and when you next call that endpoint either in the browser or using curl, you should see your changes reflected:

```bash
curl [your endpoint address]
```

## Create a new web API endpoint

Now that we have some basics under our belt, let’s expand this further and add some useful endpoints. It would be great to have a POST endpoint so we can add new records to a database. In order to do this we will use an AWS service called DynamoDB that makes having a datastore for Lambda functions quick and easy and very uncomplicated.

## Adding a DynamoDB database

In order to do this, let’s open `serverless.yml` and paste the following at the end of the file:

```yaml
resources:
  Resources:
    CustomerTable:
      Type: AWS::DynamoDB::Table
      Properties:
        AttributeDefinitions:
          - AttributeName: primary_key
            AttributeType: S
        BillingMode: PAY_PER_REQUEST
        KeySchema:
          - AttributeName: primary_key
            KeyType: HASH
        TableName: ${self:service}-customerTable-${sls:stage}
```

And lets create a new file in the same folder as the `serverless.yml` called `createCustomer.js` and add the following code to it:

```javascript
'use strict';
const AWS = require('aws-sdk');

module.exports.createCustomer = async (event) => {
  const body = JSON.parse(Buffer.from(event.body, 'base64').toString());
  const dynamoDb = new AWS.DynamoDB.DocumentClient();
  const putParams = {
    TableName: process.env.DYNAMODB_CUSTOMER_TABLE,
    Item: {
      primary_key: body.name,
      email: body.email,
    },
  };
  await dynamoDb.put(putParams).promise();

  return {
    statusCode: 201,
  };
};
```

You may have noticed we include an npm module to help us talk to AWS, so lets make sure we install this required npm module as a part of our service with the following command:

```bash
npm install aws-sdk
```

Note: If you would like this entire project as a reference to clone, you can find this on [GitHub](https://github.com/serverless/tutorial/tree/main/getting-started) but just remember to add your own org and app names to `serverless.yml` to connect to your Serverless Dashboard account before deploying.

## Making the database table name available to the function

In order for our function to know what table to access, we need some way to make that name available and thankfully Lambda has the concept of environment variables. You can set an environment variable in your `serverless.yml` that is then accessible to the function in code. Under the provider section of your `serverless.yml` add the following:

```yaml
provider:
  environment:
    DYNAMODB_CUSTOMER_TABLE: ${self:service}-customerTable-${sls:stage}
```

In our function code, you may have noticed we access this environment variable with the following: `process.env.DYNAMODB_CUSTOMER_TABLE`. Environment variables become a very powerful way to pass configuration details we need to our Lambda functions.

## Setting function permissions

While we could go ahead and deploy our changes already (feel free to do so with the command `serverless deploy`), we do need to add one more thing to allow our code to talk to our database. By default, and for good security reasons, AWS requires that we add explicit permissions to allow Lambda functions to access other AWS services. This requires us adding some more configuration to our `serverless.yml`. Within the `provider` block of our `serverless.yml`, make sure you have the following:

```yaml
provider:
  iam:
    role:
      statements:
        - Effect: 'Allow'
          Action:
            - 'dynamodb:PutItem'
            - 'dynamodb:Get*'
            - 'dynamodb:Scan*'
            - 'dynamodb:UpdateItem'
            - 'dynamodb:DeleteItem'
          Resource: arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/${self:service}-customerTable-${sls:stage}
```

These permissions will now be applied to our Lambda function when it is deployed to allow us to connect to DynamoDB.

## Adding the endpoint

We have added configuration for a database, and even written code to talk to the database, but right now there is no way to trigger that code we wrote. Time to fix that.

In your `serverless.yml`, paste the following block within the functions block:

```yaml
createCustomer:
  handler: createCustomer.createCustomer
  events:
    - httpApi:
        path: /
        method: post
```

1. The first line allows us to give our specific function a name, in this case `createCustomer`
2. The next indented line defines where our code for this function lives. `createCustomer.createCustomer` is broken down as the file name preceding the period and the function name in the file after. You can specify an entire path if you prefer as well. If we moved the `createCustomer.js` file to another folder called `src` our handler property would be `handler: src/createCustomer.createCustomer`
3. We then need to define the events that trigger our function code. You read that right, plural. We could have multiple triggers on the same code. In our case we are just using the one.
4. The rest of the code is just standard HTTP configuration; calls are made to the root url `/` as a POST request.

## Testing the endpoint

Now let's run `serverless deploy` and a few seconds later all the changes we deployed will now be pushed to our AWS account and the post deploy summary should provide us with the information we need about our end points.

Once we are deployed we want to test the endpoint. While you can use whichever method you prefer to test HTTP endpoints for your API, we can just quickly use curl on the CLI:

```bash
curl -X POST -d '{"name":"Gareth Mc Cumskey","email":"gareth@mccumskey.com"}' --url https://[insert your url here]/
```

## Adding a GET endpoint

Now that we can insert data into our API, lets put a quick endpoint together to retrieve all our customers. First we can insert the following function configuration into our `serverless.yml`:

```yaml
getCustomers:
  handler: getCustomers.getCustomers
  events:
    - httpApi:
        path: /customers
        method: get
```

Then we need to create a file called `getCustomers.js` and drop the following code in for the getCustomers function.

```javascript
'use strict';
const AWS = require('aws-sdk');

module.exports.getCustomers = async (event) => {
  const scanParams = {
    TableName: process.env.DYNAMODB_CUSTOMER_TABLE,
  };

  const dynamodb = new AWS.DynamoDB.DocumentClient();
  const result = await dynamodb.scan(scanParams).promise();

  if (result.Count === 0) {
    return {
      statusCode: 404,
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      total: result.Count,
      items: await result.Items.map((customer) => {
        return {
          name: customer.primary_key,
          email: customer.email,
        };
      }),
    }),
  };
};
```

The only thing to really take note of here is the re-use of that environment variable to access the DynamoDB table and that we now use the scan method for DynamoDB to retrieve all records.

You may have noticed that in our final version of the project, we removed the default function definition and the `handler.js` file so go ahead and do that now if you wish.

After a `serverless deploy` we now have our brand new endpoint. And if we run a curl command against it we should get the item we inserted previously:

```bash
curl –-url [insert url here]/customers
```

## Final thoughts

The Serverless Framework can make spinning up endpoints super quick. Everything we did could have taken you no more than 30 minutes. And now you have two endpoints that are, practically, production ready; they are fully redundant in AWS across three Availability Zones and fully load balanced. Ready to receive the traffic you want to throw at it without the associated bill of infrastructure sitting around waiting to be used.

Reach out to us on Twitter or even our [community Slack workspace](https://serverless.com/slack) if you have any questions or feedback. And keep your eyes out as we release more tutorial content!
