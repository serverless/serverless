// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved

package lambda

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-lambda-go/lambda/messages"
	"github.com/aws/aws-lambda-go/lambdacontext"
)

const (
	msPerS  = int64(time.Second / time.Millisecond)
	nsPerMS = int64(time.Millisecond / time.Nanosecond)
)

// TODO: replace with time.UnixMillis after dropping version <1.17 from CI workflows
func unixMS(ms int64) time.Time {
	return time.Unix(ms/msPerS, (ms%msPerS)*nsPerMS)
}

// startRuntimeAPILoop will return an error if handling a particular invoke resulted in a non-recoverable error
func startRuntimeAPILoop(api string, handler Handler) error {
	client := newRuntimeAPIClient(api)
	h := newHandler(handler)
	for {
		invoke, err := client.next()
		if err != nil {
			return err
		}
		if err = handleInvoke(invoke, h); err != nil {
			return err
		}
	}
}

// handleInvoke returns an error if the function panics, or some other non-recoverable error occurred
func handleInvoke(invoke *invoke, handler *handlerOptions) error {
	// set the deadline
	deadline, err := parseDeadline(invoke)
	if err != nil {
		return reportFailure(invoke, lambdaErrorResponse(err))
	}
	ctx, cancel := context.WithDeadline(handler.baseContext, deadline)
	defer cancel()

	// set the invoke metadata values
	lc := lambdacontext.LambdaContext{
		AwsRequestID:       invoke.id,
		InvokedFunctionArn: invoke.headers.Get(headerInvokedFunctionARN),
	}
	if err := parseClientContext(invoke, &lc.ClientContext); err != nil {
		return reportFailure(invoke, lambdaErrorResponse(err))
	}
	if err := parseCognitoIdentity(invoke, &lc.Identity); err != nil {
		return reportFailure(invoke, lambdaErrorResponse(err))
	}
	ctx = lambdacontext.NewContext(ctx, &lc)

	// set the trace id
	traceID := invoke.headers.Get(headerTraceID)
	os.Setenv("_X_AMZN_TRACE_ID", traceID)
	// nolint:staticcheck
	ctx = context.WithValue(ctx, "x-amzn-trace-id", traceID)

	// call the handler, marshal any returned error
	response, invokeErr := callBytesHandlerFunc(ctx, invoke.payload, handler.handlerFunc)
	if invokeErr != nil {
		if err := reportFailure(invoke, invokeErr); err != nil {
			return err
		}
		if invokeErr.ShouldExit {
			return fmt.Errorf("calling the handler function resulted in a panic, the process should exit")
		}
		return nil
	}
	// if the response needs to be closed (ex: net.Conn, os.File), ensure it's closed before the next invoke to prevent a resource leak
	if response, ok := response.(io.Closer); ok {
		defer response.Close()
	}

	// if the response defines a content-type, plumb it through
	contentType := contentTypeBytes
	type ContentType interface{ ContentType() string }
	if response, ok := response.(ContentType); ok {
		contentType = response.ContentType()
	}

	if err := invoke.success(response, contentType); err != nil {
		return fmt.Errorf("unexpected error occurred when sending the function functionResponse to the API: %v", err)
	}

	return nil
}

func reportFailure(invoke *invoke, invokeErr *messages.InvokeResponse_Error) error {
	errorPayload := safeMarshal(invokeErr)
	log.Printf("%s", errorPayload)
	if err := invoke.failure(bytes.NewReader(errorPayload), contentTypeJSON); err != nil {
		return fmt.Errorf("unexpected error occurred when sending the function error to the API: %v", err)
	}
	return nil
}

func callBytesHandlerFunc(ctx context.Context, payload []byte, handler handlerFunc) (response io.Reader, invokeErr *messages.InvokeResponse_Error) {
	defer func() {
		if err := recover(); err != nil {
			invokeErr = lambdaPanicResponse(err)
		}
	}()
	response, err := handler(ctx, payload)
	if err != nil {
		return nil, lambdaErrorResponse(err)
	}
	return response, nil
}

func parseDeadline(invoke *invoke) (time.Time, error) {
	deadlineEpochMS, err := strconv.ParseInt(invoke.headers.Get(headerDeadlineMS), 10, 64)
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to parse deadline: %v", err)
	}
	return unixMS(deadlineEpochMS), nil
}

func parseCognitoIdentity(invoke *invoke, out *lambdacontext.CognitoIdentity) error {
	cognitoIdentityJSON := invoke.headers.Get(headerCognitoIdentity)
	if cognitoIdentityJSON != "" {
		if err := json.Unmarshal([]byte(cognitoIdentityJSON), out); err != nil {
			return fmt.Errorf("failed to unmarshal cognito identity json: %v", err)
		}
	}
	return nil
}

func parseClientContext(invoke *invoke, out *lambdacontext.ClientContext) error {
	clientContextJSON := invoke.headers.Get(headerClientContext)
	if clientContextJSON != "" {
		if err := json.Unmarshal([]byte(clientContextJSON), out); err != nil {
			return fmt.Errorf("failed to unmarshal client context json: %v", err)
		}
	}
	return nil
}

func safeMarshal(v interface{}) []byte {
	payload, err := json.Marshal(v)
	if err != nil {
		v := &messages.InvokeResponse_Error{
			Type:    "Runtime.SerializationError",
			Message: err.Error(),
		}
		payload, err := json.Marshal(v)
		if err != nil {
			panic(err) // never reach
		}
		return payload
	}
	return payload
}
