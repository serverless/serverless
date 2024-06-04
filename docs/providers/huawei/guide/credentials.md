# Huawei Cloud - Credentials

The Serverless Framework needs access to account credentials for your Huawei Cloud account so that it can create and manage resources on your behalf.

## Create an Huawei Cloud Account

If you already have a Huawei Cloud account, skip to the next step to [Get the Credentials](#get-the-credentials)

To create a Huawei Cloud account:
1. Open https://www.huaweicloud.com/, and then choose Register.
2. Follow the online instructions.

See <a href="https://support.huaweicloud.com/usermanual-account/account_id_001.html" target="_blank">Create an Huawei Cloud account.</a>

## Get the Credentials

You need to create credentials Serverless can use to create resources in your Project.

1. Go to the <a href="https://console.huaweicloud.com/iam/#/mine/accessKey" target="_blank">Access Keys</a> page to get the Access Keys of your Huawei Cloud account.
2. Create a file named `credentials` containing the credentials that you have collected..

```ini
access_key_id=<collected in step 1>
secret_access_key=<collected in step 1>
```

3. Save the credentials file somewhere secure. We recommend making a folder in your root folder and putting it there, like `~/.fg/credentials`. Remember the path you saved it to.

## Update the `provider` config in `serverless.yml`

Open up your `serverless.yml` file and update the `provider` section with
the path to your credentials file (this path needs to be absolute!). It should look something like this:

```yml
provider:
  name: huawei
  runtime: Node.js14.18
  credentials: ~/.fg/credentials
```
