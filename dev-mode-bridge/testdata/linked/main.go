// Command linked is a test fixture for cmd/notices and cmd/build-layer: a binary that links a
// third-party module, as the bridge does.
package main

import (
	"fmt"

	"github.com/aws/smithy-go"
)

func main() { fmt.Println(smithy.FaultServer) }
