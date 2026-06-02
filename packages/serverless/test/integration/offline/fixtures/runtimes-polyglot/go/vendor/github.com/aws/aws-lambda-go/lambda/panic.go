// Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package lambda

import (
	"fmt"
	"runtime"
	"strings"

	"github.com/aws/aws-lambda-go/lambda/messages"
)

type panicInfo struct {
	Message    string                                      // Value passed to panic call, converted to string
	StackTrace []*messages.InvokeResponse_Error_StackFrame // Stack trace of the panic
}

func getPanicInfo(value interface{}) panicInfo {
	message := getPanicMessage(value)
	stack := getPanicStack()

	return panicInfo{Message: message, StackTrace: stack}
}

func getPanicMessage(value interface{}) string {
	return fmt.Sprintf("%v", value)
}

var defaultErrorFrameCount = 32

func getPanicStack() []*messages.InvokeResponse_Error_StackFrame {
	s := make([]uintptr, defaultErrorFrameCount)
	const framesToHide = 3 // this (getPanicStack) -> getPanicInfo -> handler defer func
	n := runtime.Callers(framesToHide, s)
	if n == 0 {
		return make([]*messages.InvokeResponse_Error_StackFrame, 0)
	}

	s = s[:n]

	return convertStack(s)
}

func convertStack(s []uintptr) []*messages.InvokeResponse_Error_StackFrame {
	var converted []*messages.InvokeResponse_Error_StackFrame
	frames := runtime.CallersFrames(s)

	for {
		frame, more := frames.Next()

		formattedFrame := formatFrame(frame)
		converted = append(converted, formattedFrame)

		if !more {
			break
		}
	}
	return converted
}

func formatFrame(inputFrame runtime.Frame) *messages.InvokeResponse_Error_StackFrame {
	path := inputFrame.File
	line := int32(inputFrame.Line)
	label := inputFrame.Function

	// Strip GOPATH from path by counting the number of seperators in label & path
	//
	// For example given this:
	//     GOPATH = /home/user
	//     path   = /home/user/src/pkg/sub/file.go
	//     label  = pkg/sub.Type.Method
	//
	// We want to set:
	//     path  = pkg/sub/file.go
	//     label = Type.Method

	i := len(path)
	for n, g := 0, strings.Count(label, "/")+2; n < g; n++ {
		i = strings.LastIndex(path[:i], "/")
		if i == -1 {
			// Something went wrong and path has less seperators than we expected
			// Abort and leave i as -1 to counteract the +1 below
			break
		}
	}

	path = path[i+1:] // Trim the initial /

	// Strip the path from the function name as it's already in the path
	label = label[strings.LastIndex(label, "/")+1:]
	// Likewise strip the package name
	label = label[strings.Index(label, ".")+1:]

	return &messages.InvokeResponse_Error_StackFrame{
		Path:  path,
		Line:  line,
		Label: label,
	}
}
