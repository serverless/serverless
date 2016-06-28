# Provider account setup

Serverless needs access to your cloud providers account so that it can create an manage resources on your behalf.

Here we'll provide setup instruction for different cloud provider account setups. Just pick the one for your
provider and follow the steps to get everything in place for Serverless.

## Amazon Web Services

### Creating an administrative IAM User

We're going to create an admin user which can access and configure the services in your AWS account.
To get you up and running quickly, we're going to create a AWS IAM User with administrative access to your AWS account.

**Note:** In a production environment we recommend reducing the permissions to the IAM User which the Framework uses.
Unfortunately, the frameworks functionality is growing so fast, we can't yet offer you a finite set of permissions it
needs. In the interim, ensure that your AWS API Keys are kept in a safe, private location.

1. Create or login to your Amazon Web Services Account and go the the Identity & Access Management (IAM) Page
2. Click on **Users** and then **Create New Users**. Enter `serverless-admin` in the first field and click **Create**
3. View and copy the security credentials/API Keys in a safe place
4. In the User record in the AWS IAM Dashboard, look for **Managed Policies** on the **Permissions** tab and click
**Attach Policy**
5. In the next screen, search for and select **AdministratorAccess** then click **Attach**

### Setting a default AWS profile

We'd recommend to create a `default` AWS profile on your local machine as Serverless uses this as a default which makes
developing a lot faster and easier. Follow
[these steps](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#cli-config-files)
to setup your AWS account through the AWS CLI.

## Conclusion

With the account setup in place Serverless is now able to create and manage resources on our behalf.
Now it's time to start with our first Serverless service.

[Next step > Creating a service](creating-a-service.md)
