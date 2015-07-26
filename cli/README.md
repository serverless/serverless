Servant Command Line Interface
=================================

Develop, test and upload Servant Extensions onto AWS Lambda with a few simple commands.

		npm install servant-cli -g

Commands
=================================
Make sure you've completed the set-up below and you are running these commands in your Servant Extension's root folder:
		    
		$ cd my_servant_extension
    
####servant init
Creates Servant Extension Boilerplate Files in the current directory.
	    
		$ servant init

####servant command -n *command_name* -i *command_id* 
Creates a Servant Command and boilerplate files for that command.  Specify the Command's name after the **-n**.  Paste in the Command's name after the **-i**.

		$ servant command -n example_command -i com_DJa109

####servant run -n *command_name*
Run the Command locally and seed it with the event.json data that is in its command folder.  specify **

	    $ servant run -n example_command

####servant deploy
Deploys your entire Servant Extension to AWS Lambda as a single AWS Lambda Function.  This includes zipping and uploading all of your Extension's files.

	    $ servant deploy

Set-Up
=================================

If you haven't set up your AWS Account yet to work with Lambda, here is how to do it perfectly.  Register or sign in to your Amazon Web Services Account and go to the IAM (Identity & Access Management) service and then click on Policies because we're going to make 2 access policies:


#####Servant Lambda Access Policy

Click 'Create Policy' then select 'Create Your Own Policy' and enter in the following:

Policy Name:  
servant_lambda_access_policy

Policy Description: 
Gives Servant permission to call your Lambda functions.

Paste in this Policy Document:

        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "lambda:*"
                    ],
                    "Resource": "*"
                },
                {
                    "Sid": "Stmt1404366560000",
                    "Effect": "Allow",
                    "Action": [
                        "iam:PassRole"
                    ],
                    "Resource": [
                        "arn:aws:iam::149631484542:role/servant_lambda"
                    ]
                }
            ]
        }

#####Servant Lambda Resources Policy

Now, let's create the second policy.  In the Policies screen, click 'Create Policy' then select 'Create Your Own Policy' and enter in the following:

Policy Name:  
servant_lambda_resources_policy

Policy Description: 
Gives the lambda function containing your Servant Extension access to call useful AWS resources like dynamodb and s3.

Paste in this Policy Document:

        {
		  "Version": "2012-10-17",
		  "Statement": [
		    {
		      "Effect": "Allow",
		      "Action": [
		        "cloudwatch:*",
		        "cognito-identity:ListIdentityPools",
		        "cognito-sync:GetCognitoEvents",
		        "cognito-sync:SetCognitoEvents",
		        "dynamodb:*",
		        "iam:ListAttachedRolePolicies",
		        "iam:ListRolePolicies",
		        "iam:ListRoles",
		        "iam:PassRole",
		        "kinesis:DescribeStream",
		        "kinesis:ListStreams",
		        "kinesis:PutRecord",
		        "lambda:*",
		        "logs:*",
		        "s3:*",
		        "sns:ListSubscriptions",
		        "sns:ListSubscriptionsByTopic",
		        "sns:ListTopics",
		        "sns:Subscribe",
		        "sns:Unsubscribe"
		      ],
		      "Resource": "*"
		    }
		  ]
		}

Now, in the IAM section, go to Users and create a new User called `servant`.  In that User, click 'Attach Policy', and then search for `servant_lambda_access_policy`.  Select it and attach it to the User.

After the policy is attached, while viewing the `servant` User, find the 'Access Keys' section, click 'Create Access Key' and copy the `Access Key ID` and the `Secret Access Key`.  You will need these shortly.

Next, in the IAM section, go to Roles and create a new Role called `servant_lambda`.  In that Role, click 'Attach Policy', and then search for `servant_lambda_resources_policy`.  Select it and attach it to the Role.

After the policy is attached, while viewing the `servant_lambda` Role, copy the `Role ARN` and save it with the Access Keys you saved earlier.  You will need this and the Access Keys shortly.

You're done with AWS!  Whew!  Hopefully that wasn't too bad.



