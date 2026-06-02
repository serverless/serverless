# Sample Function

The following is a sample Lambda functions that are used for custom authentication with Cognito User Pools.
These Lambda triggers issue and verify their own challenges as part of a user pool [custom authentication flow](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow.html#amazon-cognito-user-pools-custom-authentication-flow).

Please see instructions for setting up the Cognito triggers at https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html 

Define Auth Challenge Lambda Trigger:
```go
package main

import (
	"fmt"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-lambda-go/events"
)

func handler(event *events.CognitoEventUserPoolsDefineAuthChallenge) (*events.CognitoEventUserPoolsDefineAuthChallenge, error) {
	fmt.Printf("Define Auth Challenge: %+v\n", event)
	return event, nil
}

func main() {
	lambda.Start(handler)
}
```

Create Auth Challenge Lambda Trigger:
```go
package main

import (
	"fmt"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-lambda-go/events"
)

func handler(event *events.CognitoEventUserPoolsCreateAuthChallenge) (*events.CognitoEventUserPoolsCreateAuthChallenge, error) {
	fmt.Printf("Create Auth Challenge: %+v\n", event)
	return event, nil
}

func main() {
	lambda.Start(handler)
}
```

Verify Auth Challenge Response Lambda Trigger:
```go
package main

import (
	"fmt"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-lambda-go/events"
)

func handler(event *events.CognitoEventUserPoolsVerifyAuthChallenge) (*events.CognitoEventUserPoolsVerifyAuthChallenge, error) {
	fmt.Printf("Verify Auth Challenge: %+v\n", event)
	return event, nil
}

func main() {
	 lambda.Start(handler)
}
```
