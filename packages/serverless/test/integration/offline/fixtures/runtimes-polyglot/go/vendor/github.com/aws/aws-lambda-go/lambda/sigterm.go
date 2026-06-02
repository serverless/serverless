// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.

package lambda

import (
	"log"
	"os"
	"os/signal"
	"syscall"
)

// enableSIGTERM configures an optional list of sigtermHandlers to run on process shutdown.
// This non-default behavior is enabled within Lambda using the extensions API.
func enableSIGTERM(sigtermHandlers []func()) {
	// for fun, we'll also optionally register SIGTERM handlers
	if len(sigtermHandlers) > 0 {
		signaled := make(chan os.Signal, 1)
		signal.Notify(signaled, syscall.SIGTERM)
		go func() {
			<-signaled
			for _, f := range sigtermHandlers {
				f()
			}
		}()
	}

	// detect if we're actually running within Lambda
	endpoint := os.Getenv("AWS_LAMBDA_RUNTIME_API")
	if endpoint == "" {
		log.Print("WARNING! AWS_LAMBDA_RUNTIME_API environment variable not found. Skipping attempt to register internal extension...")
		return
	}

	// Now to do the AWS Lambda specific stuff.
	// The default Lambda behavior is for functions to get SIGKILL at the end of lifetime, or after a timeout.
	// Any use of the Lambda extension register API enables SIGTERM to be sent to the function process before the SIGKILL.
	// We'll register an extension that does not listen for any lifecycle events named "GoLangEnableSIGTERM".
	// The API will respond with an ID we need to pass in future requests.
	client := newExtensionAPIClient(endpoint)
	id, err := client.register("GoLangEnableSIGTERM")
	if err != nil {
		log.Printf("WARNING! Failed to register internal extension! SIGTERM events may not be enabled! err: %v", err)
		return
	}

	// We didn't actually register for any events, but we need to call /next anyways to let the API know we're done initalizing.
	// Because we didn't register for any events, /next will never return, so we'll do this in a go routine that is doomed to stay blocked.
	go func() {
		_, err := client.next(id)
		log.Printf("WARNING! Reached expected unreachable code! Extension /next call expected to block forever! err: %v", err)
	}()

}
