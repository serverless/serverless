<!--
title: Serverless Dashboard - Notifications
menuText: Notifications
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/monitoring/notifications/)

<!-- DOCS-SITE-LINK:END -->

# Notifications

The Serverless Framework can notify you in **Slack**, **Email**, **SNS Topics**, or via
**webhooks** when [alerts](./alerts.md) are generated for your application. Multiple notifications can be added to an application, each of which can be configured differently for different alerts, stages or services.

## Add a Notification to an Application

1. Navigate to the **applications** tab from the main menu.
2. Select the application for which you would like to configure the notifications and expand the application view.
3. Open the **notifications** tab in the application.
4. Follow the "**Click here to create your first notification.**" link.
5. Fill out the form and click **add notification** to save the new notification. The notification can be scoped to include only the **alerts**, **stages** or **services** you want.
   - **alerts** - select "all alerts" to be notified about all alerts, including alerts which may be made available in the future, or individually select the alerts. The [Alerts](./insights.md#alerts) section provides more details on each of the available alert types.
   - **stages** - select "all stages" to be notified about alerts on all stages, including stages which may be created in the future, or individually select the stages. The stages must be [configured](./profiles.md#add-a-deployment-profile-to-your-application-and-stage) on the application first for them to be available.
   - **services** - select "all services" to notified about alerts on all services, including services which will be deployed in the future, or individually select the services.

## Configure an existing SNS Topic

In order for Serverless Framework to notify you in a **SNS Topics**, it must be granted
permission to publish to the topic. If you have an existing SNS Topic this is how you configure the Access Policy on the Topic to grant Serverless Framework permission to publish
notifications to the topic.

1. Go to the [SNS in the AWS Console](https://console.aws.amazon.com/sns/v3/home).
2. Select the desired topic from the topics list.
3. When adding a notification to an application, use the ARN of the Topic in the SNS Topic ARN field.
4. Navigate to the Topic and select **Edit** and expand the **Access policy** section.
5. Add the following statement into the `Statement` array in the JSON editor.
6. Save the changes.

```json
{
  "Sid": "ServerlessFrameworkEnterprise-Publish",
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::802587217904:root"
  },
  "Action": "SNS:Publish",
  "Resource": "arn:aws:sns:region:account-id:sns-topic-name"
}
```

## Create a new SNS Topic from a Serverless Framework service

Serverless Framework supports the creation of SNS Topics and the corresponding SNS Topic Policy from your `serverless.yml` file. The following snippet performs the following:

- Creates a new SNS Topic "AlarmTopic".
- Creates a new SNS Topic Policy "AlarmTopicPolicy" and grants the Serverless Framework AWS Account (account id: 802587217904) permission to publish to the SNS Topic "AlarmTopic".
- Configures the function and event to accept notifications from the SNS Topic "AlarmTopic".
- Exports the ARN of the SNS Topic so that it's easily available for you to paste into the Serverless Framework console.

Once the service, SNS Topic and SNS Topic Policies are deployed via `serverless deploy`, go to
[SNS in the AWS Console](https://console.aws.amazon.com/sns/v3/home) and identify the SNS Topic ARN to use with the notification.

```yaml
custom:
  topicName: notify

functions:
  alertSnsConsumer:
    handler: handler.snsConsumer
    events:
      - sns:
          arn:
            Ref: AlarmTopic
          topicName: ${self:custom.topicName}

resources:
  Resources:
    AlarmTopic:
      Type: AWS::SNS::Topic
      Properties:
        DisplayName: 'Serverless Alerts'
        TopicName: ${self:custom.topicName}
    AlarmTopicPolicy:
      Type: AWS::SNS::TopicPolicy
      DependsOn:
        - AlarmTopic
      Properties:
        PolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Sid: AllowServerlessFrameworkEnterpriseToPublish
              Effect: Allow
              Principal:
                AWS: 'arn:aws:iam::802587217904:root'
              Action: 'sns:Publish'
              Resource:
                Ref: AlarmTopic
        Topics:
          - Ref: AlarmTopic
  Outputs:
    SnsTopicArn:
      Description: ARN for the SNS Alarm Topic
      Value:
        Ref: AlarmTopic
```

After your deploy is complete, run `sls info -v` to show the information about your service. At the bottom, in the **Stack Outputs** section, the ARN for your SNS Topic will be displayed as the `SnsTopicArn` output.
