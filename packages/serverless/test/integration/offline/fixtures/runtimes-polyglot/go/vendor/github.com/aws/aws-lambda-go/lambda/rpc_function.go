// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

//go:build !lambda.norpc
// +build !lambda.norpc

package lambda

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/rpc"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda/messages"
	"github.com/aws/aws-lambda-go/lambdacontext"
)

func init() {
	// Register `startFunctionRPC` to be run if the _LAMBDA_SERVER_PORT environment variable is set.
	// This happens when the runtime for the function is configured as `go1.x`.
	// The value of the environment variable will be passed as the first argument to `startFunctionRPC`.
	// This allows users to save a little bit of coldstart time in the download, by the dependencies brought in for RPC support.
	// The tradeoff is dropping compatibility with the RPC mode of the go1.x runtime.
	// To drop the rpc dependencies, compile with `-tags lambda.norpc`
	startFunctions = append([]*startFunction{{
		env: "_LAMBDA_SERVER_PORT",
		f:   startFunctionRPC,
	}}, startFunctions...)
}

func startFunctionRPC(port string, handler Handler) error {
	lis, err := net.Listen("tcp", "localhost:"+port)
	if err != nil {
		log.Fatal(err)
	}
	err = rpc.Register(NewFunction(handler))
	if err != nil {
		log.Fatal("failed to register handler function")
	}
	rpc.Accept(lis)
	return errors.New("accept should not have returned")
}

// Function struct which wrap the Handler
//
// Deprecated: The Function type is public for the go1.x runtime internal use of the net/rpc package
type Function struct {
	handler *handlerOptions
}

// NewFunction which creates a Function with a given Handler
//
// Deprecated: The Function type is public for the go1.x runtime internal use of the net/rpc package
func NewFunction(handler Handler) *Function {
	return &Function{newHandler(handler)}
}

// Ping method which given a PingRequest and a PingResponse parses the PingResponse
func (fn *Function) Ping(req *messages.PingRequest, response *messages.PingResponse) error {
	*response = messages.PingResponse{}
	return nil
}

// Invoke method try to perform a command given an InvokeRequest and an InvokeResponse
func (fn *Function) Invoke(req *messages.InvokeRequest, response *messages.InvokeResponse) error {
	defer func() {
		if err := recover(); err != nil {
			response.Error = lambdaPanicResponse(err)
		}
	}()

	deadline := time.Unix(req.Deadline.Seconds, req.Deadline.Nanos).UTC()
	invokeContext, cancel := context.WithDeadline(fn.baseContext(), deadline)
	defer cancel()

	lc := &lambdacontext.LambdaContext{
		AwsRequestID:       req.RequestId,
		InvokedFunctionArn: req.InvokedFunctionArn,
		Identity: lambdacontext.CognitoIdentity{
			CognitoIdentityID:     req.CognitoIdentityId,
			CognitoIdentityPoolID: req.CognitoIdentityPoolId,
		},
	}
	if len(req.ClientContext) > 0 {
		if err := json.Unmarshal(req.ClientContext, &lc.ClientContext); err != nil {
			response.Error = lambdaErrorResponse(err)
			return nil
		}
	}
	invokeContext = lambdacontext.NewContext(invokeContext, lc)

	// nolint:staticcheck
	invokeContext = context.WithValue(invokeContext, "x-amzn-trace-id", req.XAmznTraceId)
	os.Setenv("_X_AMZN_TRACE_ID", req.XAmznTraceId)

	payload, err := fn.handler.Invoke(invokeContext, req.Payload)
	if err != nil {
		response.Error = lambdaErrorResponse(err)
		return nil
	}
	response.Payload = payload
	return nil
}

func (fn *Function) baseContext() context.Context {
	if fn.handler.baseContext != nil {
		return fn.handler.baseContext
	}
	return context.Background()
}
