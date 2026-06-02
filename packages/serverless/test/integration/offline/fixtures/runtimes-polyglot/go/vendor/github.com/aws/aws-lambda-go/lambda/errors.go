// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved

package lambda

import (
	"reflect"

	"github.com/aws/aws-lambda-go/lambda/messages"
)

func getErrorType(err interface{}) string {
	errorType := reflect.TypeOf(err)
	if errorType.Kind() == reflect.Ptr {
		return errorType.Elem().Name()
	}
	return errorType.Name()
}

func lambdaErrorResponse(invokeError error) *messages.InvokeResponse_Error {
	if ive, ok := invokeError.(messages.InvokeResponse_Error); ok {
		return &ive
	}
	var errorName string
	if errorType := reflect.TypeOf(invokeError); errorType.Kind() == reflect.Ptr {
		errorName = errorType.Elem().Name()
	} else {
		errorName = errorType.Name()
	}
	return &messages.InvokeResponse_Error{
		Message: invokeError.Error(),
		Type:    errorName,
	}
}

func lambdaPanicResponse(err interface{}) *messages.InvokeResponse_Error {
	if ive, ok := err.(messages.InvokeResponse_Error); ok {
		return &ive
	}
	panicInfo := getPanicInfo(err)
	return &messages.InvokeResponse_Error{
		Message:    panicInfo.Message,
		Type:       getErrorType(err),
		StackTrace: panicInfo.StackTrace,
		ShouldExit: true,
	}
}
