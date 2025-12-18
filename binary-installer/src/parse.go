package version

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"gopkg.in/yaml.v3"
)

func getFrameworkVersionFromFile(filename string) (string, error) {
	if filename == "" {
		// Then onboarding and it should be the latest version
		return "", errors.New(ERROR_NOT_IN_FRAMEWORK_DIR)
	}
	content, err := os.ReadFile(filename)
	if err != nil {
		return "", err
	}

	ext := filepath.Ext(filename)
	switch ext {
	case ".yml", ".yaml":
		return getVersionFromYAML(content)
	case ".json":
		return getVersionFromJSON(content)
	case ".js", ".ts":
		return getVersionGeneric(content)
	}
	return "", nil
}

func getVersionFromYAML(content []byte) (string, error) {
	var data map[string]interface{}
	err := yaml.Unmarshal(content, &data)
	if err != nil {
		return "", err
	}
	if version, ok := data["frameworkVersion"].(string); ok {
		return version, nil
	}

	return "", errors.New(ERROR_NO_FRAMEWORK_VERSION)
}

func getVersionFromJSON(content []byte) (string, error) {
	var data map[string]interface{}
	err := json.Unmarshal(content, &data)
	if err != nil {
		return "", err
	}
	if version, ok := data["frameworkVersion"].(string); ok {
		return version, nil
	}

	return "", errors.New(ERROR_NO_FRAMEWORK_VERSION)
}

// This is hopefully good enough for pulling from serverless.js and serverless.json files
// But we an expand this if we need.
func getVersionGeneric(content []byte) (string, error) {
	re := regexp.MustCompile(`frameworkVersion\s*:\s*['"]*(.+)['"]`)
	matches := re.FindSubmatch(content)
	if len(matches) > 1 {
		return string(matches[1]), nil
	}

	frameworkVersionRe := regexp.MustCompile(`frameworkVersion`)
	if frameworkVersionRe.Match(content) {
		fmt.Fprintln(os.Stderr, "Could not parse frameworkVersion from file, defaulting to auto-update")
	}
	return "", errors.New(ERROR_NO_FRAMEWORK_VERSION)
}
