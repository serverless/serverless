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
3. **View and copy the API Key & Secret. You'll need it in the next step**
4. In the User record in the AWS IAM Dashboard, look for **Managed Policies** on the **Permissions** tab and click
**Attach Policy**
5. In the next screen, search for and select **AdministratorAccess** then click **Attach**

### Setting the AWS API Keys

To start using Serverless and access the AWS API. You need to set the AWS API Key & Secret in your local machine. Just copy the following command (if you're on Mac or Linux), **but make sure you replace the "<key>" & "<secret>" with your actual key & secret before running it**:

```
echo "export AWS_ACCESS_KEY_ID=<key>" >> ~/.bash_profile && echo "export AWS_SECRET_ACCESS_KEY=<secret>" >> ~/.bash_profile && source ~/.bash_profile
```
To test that you've correctly set the AWS API Key & Secret, run the following command:

```
printenv AWS_ACCESS_KEY_ID && printenv AWS_SECRET_ACCESS_KEY
```
You should see your AWS API Key & Secret printed for you. You're now ready to start using Serverless!

## Conclusion

With the account setup in place Serverless is now able to create and manage resources on our behalf.
Now it's time to start with our first Serverless service.

[Next step > Creating a service](creating-a-service.md)
