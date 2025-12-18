//go:build !canary
// +build !canary

package main

func getInstallBaseUrl() string {
	return PROD_INSTALL_URL
}
