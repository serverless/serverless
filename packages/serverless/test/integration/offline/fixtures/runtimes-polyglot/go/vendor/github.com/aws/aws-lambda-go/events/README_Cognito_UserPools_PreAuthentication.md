# Sample Function

The following is a sample Lambda function that receives Amazon Cognito User Pools pre-authentication event as an input and writes some of the record data to CloudWatch Logs. (Note that anything written to stdout or stderr will be logged as CloudWatch Logs events.)

Please see instructions for setting up the Cognito triggers at https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools-working-with-aws-lambda-triggers.html .

```go
package main

import (
    "fmt"

    "github.com/aws/aws-lambda-go/lambda"
    "github.com/aws/aws-lambda-go/events"
)

func handler(event events.CognitoEventUserPoolsPreAuthentication) (events.CognitoEventUserPoolsPreAuthentication, error) {
    fmt.Printf("PreAuthentication of user: %s\n", event.UserName)
    return event, nil
}

func main() {
  lambda.Start(handler)
}
```
