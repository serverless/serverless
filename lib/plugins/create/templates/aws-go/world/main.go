package main

import (
	"github.com/aws/aws-lambda-go/lambda"
)

type Response struct {
	Message string `json:"message"`
}

func Handler() (Response, error) {
	return Response{
		Message: "Okay so your other function also executed successfully!",
	}, nil
}

func main() {
	lambda.Start(Handler)
}
