# Google Cloud Functions (Experimental)

This plugin directory provides several Serverless plugins so that your Serverless
services can be deployed in the Google Cloud.

**NOTE:** This quick start guide should be moved to the official docs later on.

## Getting started

This guide will help you setup and deploy your first Google Cloud project.

### Verify if your account is whitelisted for Google Cloud Functions

At first please make sure that you're whitelisted to test Google Cloud Functions.
You're whitelisted if you can access the [Google Cloud Functions console](https://console.cloud.google.com/functions).

### Create a new project

1. Go to the [Google Cloud console](https://console.cloud.google.com) and click on the
dropdown next to the search bar
2. Select "Create project" and enter a new for your new project.
3. Click on "Create" to start the creation process
4. Wait until the project was successfully created (Google should redirect you to your
new project)
5. Verify that your current project is the new project by taking a look at the dropdown next
to the search bar (this should now mark your new project as selected)

### Enable the Google Cloud Functions API

You need to enable the Google Cloud Functions API so that you can use Google Cloud Functions
for your projects.

1. Go to the [Google Cloud Functions console](https://console.cloud.google.com/functions)
2. Click on "Enable API"

### Get credentials

Next up we need to create credentials Serverless can use to create resources in our
project on our behalf.

1. Go to the [Google Cloud API Manager console](https://console.cloud.google.com/apis)
and select "Credentials" on the left
2. Click on "Create credentials" and select "Service account key"
3. Select "New service account" in the "Service account" dropdown
4. Enter a name for your "Service account name" (e.g. "Serverless Framework")
5. Select "Project" --> "Owner" as the "Role"
6. The "Key type" should be "JSON"
7. Click on "Create" to create your private key
8. That's your so called `keyfile` which should be downloaded on your machine

### Rename the `keyfile`

Rename the previously obtained `.json` file to something more expressive
e.g. the name of your Google Cloud project (The corresponding project name
is the one right to the project name you defined when creating the project
(it's light grey)).

`mv the-auto-generated-name.json my-gcloud-project-123.json`

### Move the `keyfile` to a secure location

The `keyfile` is used by the Google API so that Serverless can create and manage
resources for us in our Google Cloud project. Never commit this file to source control
or share it publicly!

The `keyfile` can live in pretty much every location on your local machine.
We'd recommend to move it into home directory.

`mkdir -p ~/.gcloud/; mv my-gcloud-project123.json $_`

### Export the Google Cloud project

Export an environment variable with the name of your Google Cloud project.
You can see the name of your project if you click on the Project selection dropdown
next to the search bar in the Google Cloud console. The corresponding project name
is the one right to the project name you defined when creating the project
(it's light grey).

`export GCLOUD_PROJECT=my-gcloud-project123`

### Export your credentials / keyfile

Next up export an environment variable with the path to your `keyfile`.

`export GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/my-gcloud-project123.json`

### Create an example service

That's it. You're now all set to use Serverless with the Google Cloud!

Let's create a new service to verify that everything works smoothly.

#### Create a new service skeleton

`mkdir my-serverless-gcloud-service && cd my-serverless-gcloud-service && touch serverless.yml && touch index.js`

#### Copy the file contents

Open up the service directory and copy the content from the
[example service section](#an-example-service) below into the corresponding files.

#### Rename the service

Rename the service property in `serverless.yml` to something unique.

**NOTE:** This name should not include "google" or "goog".

#### Deploy

Run `serverless deploy` to deploy your service to the Google Cloud.

## An example service

Here's an example service you can use to get started.

**NOTE:** The file with your function handlers (the functions you export) must be
in the root of your service and named `index.js` or `function.js` (we recommend `index.js`).

```yml
# NOTE: rename the service to something unique before deploying the service
service: gcloud-service

provider:
  name: google
  runtime: nodejs4.3

functions:
  fist:
    handler: pubSub
    events:
      - pubSub: someTopicName
  second:
    handler: http
    events:
      - http: true
  # NOTE: Please create the bucket first, then comment this out and deploy again
  #third:
  #  handler: bucket
  #  events:
  #    - bucket: my-serverless-test-bucket
```

```javascript
// index.js
'use strict';

exports.pubSub = (context, data) => {
  console.log('Hello from a "pubSub" event');
  console.log(data);
  context.success();
};

exports.http = (request, response) => {
  response.status(200).send('Hello World!');
};

exports.bucket = (context, data) => {
  console.log('Hello from a "bucket" event');
  console.log(data);
  context.success();
};
```

### Example workflow

1. Deploy the service with `serverless deploy`
2. Invoke a function with `serverless invoke -f hello`
3. View the function logs with `serverless logs -f hello`
4. See information about the service with `serverless info`
5. Remove the service with `serverless remove`
