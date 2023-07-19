<!--
title: Serverless Framework - AWS Credentials
description: How to set up the Serverless Framework with your Amazon Web Services credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/credentials)

<!-- DOCS-SITE-LINK:END -->

# AWS Credentials

The Serverless Framework needs access to your cloud provider account so that it can create and manage resources on your behalf.

This guide is for the Amazon Web Services (AWS) provider, so we'll step through the process of setting up a connection to AWS for the Serverless Framework.

The Serverless Framework provides multiple methods to connect to AWS. However, the recommended configuration can be time consuming. Below we describe a quick way to get Serverless Framework connected to AWS securely. After that we provide the preferred configuration using multiple accounts to manage production and development deployments of your Serverless application.

## Quick Connect

If you want a quick way to get Serverless Framework connected to your AWS account, the easiest and simplest way is to use Serverless Dashboard and its Providers feature.

### Serverless Provider

If you are attempting to add an existing service to the Serverless Dashboard and want to find out more about adding a Provider, we recommend looking at the [Provider specific documentation](https://serverless.com/framework/docs/guides/providers) or skip to the next sections that discusses the recommended configuration of AWS accounts for production use.

If you are new to Serverless and adding credentials for your Serverless Framework service, please continue with the steps below:

1. Start by opening your terminal to an empty folder where we will install our first Serverless service.
2. Run the command “serverless”.
3. You will be prompted to choose a new template. If this is your first time, we recommend choosing the “AWS - Node.js - Starter”.
4. When prompted for a name for this new service, you can choose your own name or just leave the default of “aws-node-project”.
5. This will create a new folder with the same name as your new service and add some new files to it.
6. You will then be prompted to login/register for Serverless Dashboard. Just hit enter to choose the default of Y.
7. Your browser window should then open to the login and registration page of Serverless Dashboard. Go ahead and create your account here (Do not worry about creating an org with the right name for now. You can create a new org later to use with the right name).
8. Once you are logged into the Dashboard, return the terminal.
9. Here you should be prompted regarding AWS Credentials. We recommend choosing the “AWS Access Role” option.
10. Once selected this will open your browser once again to the “Add Providers” screen with the “Simple” provider option selected. Click “Connect AWS Provider”.
11. This will open a new browser tab to your AWS account and the CloudFormation service. Just accept the defaults and click “Create Stack” at the bottom.
12. Once the CloudFormation stack is created, switch back to the terminal tab that will detect the Provider has been created.
13. You will then be prompted to deploy. Say “Y” to deploy your first Serverless Framework service.

Note: If you already had AWS credentials on your local machine, the Serverless Framework may have skipped all steps and prompted to do a deployment using those credentials instead of prompting to create a Provider. However, if you just create a provider in your Dashboard account, run “serverless login” and then “serverless deploy” it will use the Dashboard Provider instead.

### AWS Access Key and Secret

The alternative to using the AWS IAM Role provider is to rather use an access key and secret generated in AWS IAM. These are generally considered insecure since if anyone gained access to those credentials, they have access to your AWS account.

However, if you must use an access key and secret pair, these can be added as a provider in Serverless Dashboard by choosing the “Access/Secret Keys” tab and inserting the credentials to be used.

## Production Configuration

While you might be able to get up and running with a single account quickly to try out Serverless Framework, the recommended configuration when setting up a Serverless application is a little different and consists of using multiple AWS accounts.

### Management account

Starting off with a single AWS account that is only used as a way to help manage the creation of additional AWS accounts for various purposes. This account will not have anything else deployed to it.

1. After creating the initial AWS account, usually using an alias email address for your organization or team, search for the “Organizations” service.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/create-an-organization-pre.png)
2. Click the “Create an Organization” button and you should see the view change and the account you are currently logged in on listed.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/create-an-organization-post.png)
3. Search for the IAM identity center service and click “Enable” to activate it for the management service.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-enable-pre.png)
   a. You will notice you will now have a unique URL for users to log in with that can be edited later to make it more unique for your use.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-url.png)
4. Now we want to create a new user account for you to use from this point on, so click “Users” to the left and then “Add user”. Enter your own email address and all the other details required.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-add-user-details.png)
5. Do not worry about adding the user to groups for now, just finish using “Next” to review and confirm with “Add user” at the bottom.
6. To setup permissions, click “AWS Accounts” to the left.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-menu.png)
7. After ensuring your management account is selected, click on “Assign users or groups”
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-assign-users-or-groups.png)
8. Select the “User” tab, check the box next to the user you just created and then “Next”.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/organizations-assign-users-and-groups-to-account.png)
9. Click on “Create permission set” so we can assign the right permissions to your user. This will open a new tab.
   ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/assign-permission-sets.png)
10. For now, we will recommend choosing the default of “AdminstratorAccess” under the “Predefined permissions set”, but this can be changed later if need be.
    ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/pre-defined-permission-set.png)
11. Choosing how long the session lasts only affects the user when they are logged into the AWS Console and has no impact on the use of Providers when deploying the Serverless Framework so choose any session length you wish. Click “Next” on “Permission set details”, then “Create” on the “Review and create” page.
    ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/permission-set-review.png)
12. Now that the permissions set is done, we can close this tab to go back. If you do not see the updated permissions just refresh, then choose AdminstratorAccess, Next and Submit.
    ![img](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/user-assigned-to-account.png)

You can add additional users in future in this way. You should have also received an email to activate the new account that was created. Just complete the process to sign up the new user account and we are ready to continue.

### Stage accounts for production and development

Now that we have the basics done for the management account and at least one user that is not the root user, we likely want to setup additional AWS accounts for production and development. This is done so that we can ensure that developers are not deploying experimental code and changes into the same account where your application is provisioned for use for customers.

1. Return the Organizations service and click “Add an AWS Account”
2. Try to name the new account uniquely to indicate it is your dev account
3. When asked what email address to use, use an alias of some kind as individual user accounts added via the management account will be given access to the new development account.
4. When done, click “Create AWS account”
5. Repeat this process for a production account as well

You can of course create as many of these accounts as you need, which is why it may even be useful to consider the next section.

### Developer accounts

When developing Serverless applications, often developers need to have the ability to deploy changes they have made to a service or to test out a new service. While providing development accounts is great, this may not be enough as there is a risk of overriding work d0ne by others or even causing disruptions to the team.

Using the methods described above, you can create individual AWS account per developer. This provides a good level of isolation, and can be easily managed through the Organizations service as team members are onboarded and offboarded.

### Combine with Serverless Provider

Now that the AWS accounts are structured as needed, you can also combine the use of Providers in the Serverless Dashboard as described earlier to create specific connections to those AWS account for specific stages.

Providers has its own documentation which provides a lot more detail: https://www.serverless.com/framework/docs/guides/providers
