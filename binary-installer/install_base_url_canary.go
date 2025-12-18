//go:build canary
// +build canary

package main

import (
	"os"
	"strconv"
)

func getInstallBaseUrl() string {
	if useCanary, _ := strconv.ParseBool(os.Getenv("SLS_USE_CANARY")); useCanary {
		return DEV_INSTALL_URL
	}
	return PROD_INSTALL_URL
}
