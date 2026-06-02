# Sample Function

The following is a sample Lambda function that receives DynamoDB event data as input and writes some of the record data to CloudWatch Logs. (Note that by default anything written to Console will be logged as CloudWatch Logs.)

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
)

func handleRequest(ctx context.Context, e events.DynamoDBEvent) {

	for _, record := range e.Records {
		fmt.Printf("Processing request data for event ID %s, type %s.\n", record.EventID, record.EventName)

		// Print new values for attributes of type String
		for name, value := range record.Change.NewImage {
			if value.DataType() == events.DataTypeString {
				fmt.Printf("Attribute name: %s, value: %s\n", name, value.String())
			}
		}
	}
}
```

# Reading attribute values

Stream notifications are delivered to the Lambda handler whenever data in the DynamoDB table is modified.
Depending on the Stream settings, a StreamRecord may contain the following data:

* Keys: key attributes of the modified item.
* NewImage: the entire item, as it appears after it was modified.
* OldImage: the entire item, as it appeared before it was modified.

The values for the attributes can be accessed using the AttributeValue type. For each type
supported natively by DynamoDB, there is a corresponding accessor method:

DynamoDB type  | AttributeValue accessor method | Return type               | DataType constant
---------------|--------------------------------|---------------------------|------------------
B (Binary)     | Binary()                       | []byte                    | DataTypeBinary
BOOL (Boolean) | Boolean()                      | bool                      | DataTypeBoolean
BS (Binary Set)| BinarySet()                    | [][]byte                  | DataTypeBinarySet
L (List)       | List()                         | []AttributeValue          | DataTypeList
M (Map)        | Map()                          | map[string]AttributeValue | DataTypeMap
N (Number)     | Number() / Integer() / Float() | string / int64 / float64  | DataTypeNumber 
NS (Number Set)| NumberSet()                    | []string                  | DataTypeNumberSet
NULL (Null)    | IsNull()                       | bool                      | DataTypeNull
S (String)     | String()                       | string                    | DataTypeString
SS (String Set)| StringSet()                    | []string                  | DataTypeStringSet

Calling the accessor method for the incorrect type will result in a panic. If the type needs to
be discovered in runtime, the method DataType() can be used in order to determine the correct accessor.

More information about DynamoDB data types can be seen [in this documentation](http://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_AttributeValue.html).

The following example reads values of attributes name and age, for which types are known to be String and Number:

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-lambda-go/events"
)

func handleRequest(ctx context.Context, e events.DynamoDBEvent) {

	for _, record := range e.Records {
		fmt.Printf("Processing request data for event ID %s, type %s.\n", record.EventID, record.EventName)

		// Print new values for attributes name and age
		name := record.Change.NewImage["name"].String()
		age, _ := record.Change.NewImage["age"].Integer()

		fmt.Printf("Name: %s, age: %d\n", name, age)
	}
}
```
