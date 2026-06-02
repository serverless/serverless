# Sample Function

The following is a sample Lambda function that receives an Amazon CodeBuild event
and writes it to standard output.

```go
import (
    "fmt"
    "github.com/aws/aws-lambda-go/events"
)

func handleRequest(evt events.CodeBuildEvent) {
	fmt.Println(evt)
}
```
