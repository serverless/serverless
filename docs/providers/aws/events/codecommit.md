<!--
title: Serverless Framework - AWS Lambda Events - CodeCommit
menuText: CodeCommit
menuOrder: 13
description:  Setting up AWS CodeCommit Events with AWS Lambda via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/events/codecommit)
<!-- DOCS-SITE-LINK:END -->

# CodeCommit

In the following example we create a new CodeCommit repository with the name `MyRepo` which is bound to the `git` function. The function will be called every time a change (e.g. create or delete a branch / tag, or push to an existing branch) happens to the `MyRepo` repository.

```yml
functions:
  git:
    handler: git.handler
    events:
      - git: MyRepo
```

Note that in this example you were not required to explicitly create a trigger. The framework created a default trigger which will call the function for all changes to any of `MyRepo` branches.

You're also able to add the same CodeCommit repository to multiple functions:

```yml
functions:
  git:
    handler: git.handler
    events:
      - git: MyRepo
  git2:
    handler: git2.handler
    events:
      - git: MyRepo
```

This will run both functions for any changes to any branches of repository `MyRepo`.

**Note:** Every repository trigger created by the framework assigns the `arn` of the function where the event is defined to the trigger's `destinationArn` property. Check the [CodeCommit API reference](https://docs.aws.amazon.com/codecommit/latest/APIReference/API_RepositoryTrigger.html) for details.

## Using a pre-existing repository

If an `arn:` is specified, the framework will give permission to the repository to invoke the function.

**Note:**  The repository trigger to invoke the function will not be created by the framework.

```yml
functions:
  git:
    handler: git.handler
    events:
      - git: arn:xxx
```

```yml
functions:
  git:
    handler: git.handler
    events:
      - git:
          arn: arn:xxx
```

Or with intrinsic CloudFormation function like `Fn::Join` or `Fn::GetAtt`.

```yml
functions:
  git:
    handler: git.handler
    events:
      - git:
          arn:
            Fn::Join:
              - ""
              - - "arn:aws:codecommit:"
                - Ref: "AWS::Region"
                - ":"
                - Ref: "AWS::AccountId"
                - ":MyRepo"
          repositoryName: MyRepo
```

**Note:** It is important to know that the repository `arn` must contain the value given in the `repositoryName` property.

## Using custom triggers

We can customize our triggers as well. In the following example we explicitly create a trigger named `MyTrigger` which will call the function `git` for every push to `MyRepo` repository branches `MyBranch1` or `MyBranch2`.

```yml
functions:
  git:
    handler: git.handler
    events:
      - git:
        repositoryName: MyRepo
        triggers:
          - name: MyTrigger
            events:
              - updateReference
            branches:
              - MyBranch1
              - MyBranch2
```

## Adding custom data to a trigger

Now we create a trigger named `MyTrigger` which will call the function `git` for every change to any `MyRepo` repository branches and any `customData` defined in the trigger will be included in the information sent to the function.

```yml
functions:
  git:
    handler: git.handler
    events:
      - git:
        repositoryName: MyRepo
        triggers:
          - name: MyTrigger
            customData: MyCustomData
```

## Note About CodeCommit Users & Roles

As indicated in the [AWS CodeCommit FAQs](https://aws.amazon.com/codecommit/faqs/), CodeCommit charges per active user, which may lead to unnecessary charges if you create/delete CodeCommit related IAM users/roles along your services.

You may want to consider creating your CodeCommit related IAM users/roles in their own service file as follows.

Sample CodeCommit setup service:

```yml
service: setupCodeCommit

provider:
  name: aws
  runtime: nodejs8.10

resources:
  Resources:
    userCodeCommit:
      # If using ssh create & upload ssh key to this user account
      Type: AWS::IAM::User
      Properties:
        UserName: codeCommitUser
        Policies:
          - PolicyName: gitPolicy
            PolicyDocument:
              Version: '2012-10-17'
              Statement:
                - Effect: Allow
                  Action: # actions below work for git clients, use other actions if using CodeCommit API
                    - codecommit:GitPull
                    - codecommit:GitPush
                  Resource:
                    - 'Fn::Join':
                      - ':'
                      - - 'arn:aws:codecommit'
                        - Ref: 'AWS::Region'
                        - Ref: 'AWS::AccountId'
                        - '*'

    roleCodeCommit: # you will likely want to add permissions for CloudWatch logging
      Type: AWS::IAM::Role
      Properties:
        RoleName: codeCommitRole
        AssumeRolePolicyDocument:
          Version: "2012-10-17"
          Statement:
            -
              Effect: "Allow"
              Principal:
                Service:
                  - "lambda.amazonaws.com"
              Action:
                - "sts:AssumeRole"
        ManagedPolicyArns:
          - 'arn:aws:iam::aws:policy/AWSCodeCommitFullAccess'

  # The "Outputs" that your AWS CloudFormation Stack should produce. This allows references between services.
  Outputs:
    UserArn:
      Description: The ARN for user codeCommitUser
      Value:
        'Fn::GetAtt': [ userCodeCommit, Arn ]
      Export:
        Name: ${self:service}:codeCommitUser

    RoleArn:
      Description: The ARN for user codeCommitRole
      Value:
        'Fn::GetAtt': [ roleCodeCommit, Arn ]
      Export:
        Name: setupCodeCommit-codeCommitRole
```

And then reference the role in your other service files, like so:

```yml
functions:
  git:
    handler: git.handler
    role: 'Fn::ImportValue': 'setupCodeCommit-codeCommitRole'
    events:
      - git: MyRepo
```

The user is typically used indirectly, by referencing its CodeCommit keyId and key if using a git client through ssh.
