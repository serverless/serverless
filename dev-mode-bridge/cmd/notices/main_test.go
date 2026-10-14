package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const fixture = "github.com/serverless/serverless/dev-mode-bridge/testdata/linked"

func generate(t *testing.T, pkg string) []byte {
	t.Helper()
	out := filepath.Join(t.TempDir(), "NOTICES")
	if err := run(out, pkg); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestListsTheLicenceOfEveryLinkedModule(t *testing.T) {
	data := generate(t, fixture)
	text := string(data)
	if !strings.HasPrefix(text, header) || !strings.Contains(header, "-out layer/sls-dev-THIRD_PARTY_NOTICES`") {
		t.Fatalf("no header:\n%.300s", text)
	}
	for _, want := range []string{
		"\n== Go standard library and runtime ==\n-- LICENSE --\nCopyright 2009 The Go Authors.",
		"\n== github.com/aws/smithy-go v",
		"-- LICENSE --\n",
		"Apache License",
		"-- NOTICE --\n",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %q", want)
		}
	}
	if bytes.ContainsRune(data, '\r') {
		t.Error("carriage returns in the notices")
	}
	if strings.Contains(text, "paho") {
		t.Error("a module that is not linked is named")
	}
	if !bytes.Equal(data, generate(t, fixture)) {
		t.Error("two runs differ")
	}
}

// The layer ships layer/sls-dev-THIRD_PARTY_NOTICES as committed; it must be what the generator
// writes for the bridge today, or a go.mod change was committed without regenerating it.
func TestTheCommittedNoticesAreCurrent(t *testing.T) {
	committed, err := os.ReadFile(filepath.Join("..", "..", "layer", "sls-dev-THIRD_PARTY_NOTICES"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(committed, generate(t, bridgePackage)) {
		t.Fatal("layer/sls-dev-THIRD_PARTY_NOTICES is stale; run: go run ./cmd/notices -out layer/sls-dev-THIRD_PARTY_NOTICES")
	}
}
