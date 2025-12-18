package certs

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigureHTTPRootCAs_NoPanicWithTempPEM(t *testing.T) {
	tmp := t.TempDir()
	pem := filepath.Join(tmp, "extra.pem")
	// Minimal empty file; loader ignores unreadable or invalid content
	_ = os.WriteFile(pem, []byte(""), 0o644)
	t.Setenv("NODE_EXTRA_CA_CERTS", pem)
	// Should not panic
	ConfigureHTTPRootCAs()
}
