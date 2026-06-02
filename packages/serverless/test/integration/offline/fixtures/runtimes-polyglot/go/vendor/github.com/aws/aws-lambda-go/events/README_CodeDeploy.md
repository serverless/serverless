# Sample Function

The following is a sample Lambda function that receives an Amazon CodeDeploy event
and writes it to standard output.

```go
import (
    "fmt"
    "github.com/aws/aws-lambda-go/events"
)

func handleRequest(evt events.CodeDeployEvent) {
	fmt.Println(evt)
}
```
