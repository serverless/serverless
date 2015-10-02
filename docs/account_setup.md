###### AWS Free Tier

AWS gives you a ton of free resources whenever you create a new AWS account.  This is called the free tier.  It includes a massive allowance of free Lambda Requests, DynamoDB tables, S3 storage, and more.

Before building JAWS apps, we strongly recommend starting with a fresh AWS account for maximum cost savings.

###### Create An Administrative IAM User

We're going to create an admin User which can access and configure all services in your AWS account.  Part of what JAWS does is automate AWS tasks for you (e.g., upload and create lambda functions), but JAWS needs *Admin* access to your AWS account to perform these automations.  **Note:** this is not a recommended in any sort of real environment, but will get you up and going quick.  For guidelines please refer to our [best practices](https://github.com/jaws-stack/JAWS/wiki/v1:best-practices) wiki page.

* Create or login to your Amazon Web Services Account and go the the Identity & Access Management (IAM) Page.

* Click on *Users* and then *Create New Users*.  Enter *jaws-admin* in the first field and click *Create*.

* View and copy the security credentials/API Keys.  Add the *Access Key* and *Secret Access Key* from your newly created IAM User to `~/.aws/credentials` file on your system like this:

```
[default]
aws_access_key_id=AKIAIOSFODNN7EXAMPLE
aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

And put the following in `~/.aws/config`:

```
[default]
region = us-east-1
```

* In the User record in the AWS IAM Dashboard, look for *Managed Policies* and click *Attach Policy*.  In the next screen, search for and select *AdministratorAccess* then click *Attach*. **NOTE**: this is not a good security policy - it is only intended to get you up and going.  Please read our [best practices](https://github.com/jaws-framework/JAWS/wiki/v1:best-practices#security) for how this should be done in production.

