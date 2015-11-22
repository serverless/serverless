# Multiple lambdas under one URI

This tutorial will show you how to set up a typical CRUD rest endpoint.  For example (taken from the [Polls API](https://github.com/apiaryio/api-blueprint/blob/master/examples/Polls%20API.md) example from [api-blueprint](https://apiblueprint.org/) used by [Apiary](http://apiary.io)):

 + /questions
  + (GET) - gets a list of all of the questions
  + (POST) - creates a new question

Before we start we assume that you've set up your initial project as described [here](../../README.md).

## Step 1: Create your "GET" AWSM/Lambda
First thing we need to do is create the AWS Module for the GET action.  This is a simple:

```bash
jaws module create questions get
```
from the command line.

This command, of course, creates an AWSM module with a resource of "questions" and an action of "get".  This will create the following structure:

 + awsm_modules
    + questions
      + get
        + awsm.json
        + event.json
        + index.js
        + handler.js

It also binds to the endpoint __{endpoint url}/question/get__ by default.

This is not quite what we are going for.  In order to fix it, open up the _awsm.json_ file.  Find the following:

```json
{

  . . .

  "apiGateway": {

    . . .

    "cloudFormation": {
      "Type": "AWS",
      "Path": "questions/get",
      "Method": "GET",

      . . .

    }
  }
}
```
And change the _"Path"_ value to simply "questions", so you end up with this:
```json
{

  . . .

  "apiGateway": {

    . . .

    "cloudFormation": {
      "Type": "AWS",
      "Path": "questions",
      "Method": "GET",

      . . .

    }
  }
}
```

This tells the endpoint to invoke your lambda for a GET request to __{endpoint url}/questions__, rather than, __{endpoint url}/questions/get__.

Now, we'll change what happens in the lambda to ensure that the correct lambda was invoked when we test later on. Open _index.js_ and find the section:
```javascript
// Your Code
var action = function() {
  return {message: 'Your JAWS lambda executed successfully!'};
};
```

and change it to be:

```javascript
// Your Code
var action = function() {
  return {message: 'The list of questions should be here'};
};
```

## Step 2: Create your "POST" AWSM/Lambda

Next we need to create the AWS Module for the post action.  So again in the shell:

```bash
jaws create module questions post
```

This will, of course, create an *aws_modules/questions/post* folder, with the contents described in the previous step.  It will also bind the lambda to the {endpoint url}/questions/post and respond only to GET requests.  Totally not what we want again.

Fix it by opening the _awsm.json_ file for this module. Find this section:

```json
{

  . . .

  "apiGateway": {

    . . .

    "cloudFormation": {
      "Type": "AWS",
      "Path": "questions/post",
      "Method": "GET",

      . . .

    }
  }
}
```

Change it so that the _"Path"_ is again changed to "questions".  Change the _"Method"_ to be "POST".  Your file should look like this:

```json
{

  . . .

  "apiGateway": {

    . . .

    "cloudFormation": {
      "Type": "AWS",
      "Path": "questions",
      "Method": "POST",

      . . .

    }
  }
}
```

This assigns this lambda to the same endpoint as the GET request from step 1, but this time for a POST request.

Finally, open _index.js_ and again find the section:

```javascript
// Your Code
var action = function() {
  return {message: 'Your JAWS lambda executed successfully!'};
};
```

and change it to be:

```javascript
// Your Code
var action = function() {
  return {message: 'Your question was submitted'};
};
```

so that we can ensure that the right lambda is called when we test the deployment.

##  Step 3: Deploy

Now all you need to do is deploy your code.  You can do this through the JAWS Dashboard:

```bash
jaws dash
```

or completely on the command line:

```bash
cd aws_modules/questions/get
jaws deploy lambda
jaws deploy endpoint
cd ../post
jaws deploy lambda
jaws deploy endpoint
```
You be given an **{endpoint url}** by these steps, copy it to a safe place.

## Step 4: invoke the endpoints

Finally, place a GET request through to {endpoint url}/questions.  You can do this easily with curl:

```bash
curl -XGET "{endpoint url}/questions"
```
which should return:
```bash
{"message":"The list of questions should be here"}
```

and now a POST request:
```bash
curl -XPOST "{endpoint url}/questions"
```
which should yield:
```bash
{"message":"Your question was submitted"}
```
