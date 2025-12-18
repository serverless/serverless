package certs

import (
	"crypto/tls"
	"crypto/x509"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// ConfigureHTTPRootCAs augments the default HTTP client's Root CAs with
// certificates provided via common environment variables used by Node/OpenSSL:
//   - NODE_EXTRA_CA_CERTS: path to a PEM file containing one or more certs
//   - SSL_CERT_FILE: path to a PEM file containing one or more certs
//   - SSL_CERT_DIR: path list (os.PathListSeparator separated) of directories
//     containing PEM cert files
func ConfigureHTTPRootCAs() {
	// Build a base pool from the system certs (if available)
	pool, _ := x509.SystemCertPool()
	if pool == nil {
		pool = x509.NewCertPool()
	}

	// Collect candidate cert files from env
	var certFiles []string
	if v, ok := os.LookupEnv("NODE_EXTRA_CA_CERTS"); ok && strings.TrimSpace(v) != "" {
		certFiles = append(certFiles, v)
	}
	if v, ok := os.LookupEnv("SSL_CERT_FILE"); ok && strings.TrimSpace(v) != "" {
		certFiles = append(certFiles, v)
	}

	// Load certs from files
	for _, p := range certFiles {
		loadPEMCertsFromFile(pool, p)
	}

	// Load certs from directories
	if v, ok := os.LookupEnv("SSL_CERT_DIR"); ok && strings.TrimSpace(v) != "" {
		for _, dir := range strings.Split(v, string(os.PathListSeparator)) {
			if strings.TrimSpace(dir) == "" {
				continue
			}
			loadPEMCertsFromDir(pool, dir)
		}
	}

	// Swap the default transport to ensure all default clients honor the pool
	if dt, ok := http.DefaultTransport.(*http.Transport); ok {
		t := dt.Clone()
		if t.TLSClientConfig == nil {
			t.TLSClientConfig = &tls.Config{}
		}
		t.TLSClientConfig.RootCAs = pool
		http.DefaultTransport = t
	} else {
		// Fallback: construct a fresh transport if DefaultTransport is unexpected
		http.DefaultTransport = &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool}}
	}
}

func loadPEMCertsFromFile(pool *x509.CertPool, path string) {
	// Ignore errors silently; non-existent or unreadable files are skipped
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	pool.AppendCertsFromPEM(b)
}

func loadPEMCertsFromDir(pool *x509.CertPool, dir string) {
	// Iterate directory entries; attempt to append PEM certs from each file
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		// Only consider regular files
		if info, err := e.Info(); err == nil {
			if info.Mode()&fs.ModeSymlink != 0 {
				// Resolve symlinks
				resolved, err := filepath.EvalSymlinks(filepath.Join(dir, e.Name()))
				if err == nil {
					loadPEMCertsFromFile(pool, resolved)
					continue
				}
			}
			if !info.Mode().IsRegular() {
				continue
			}
		}
		loadPEMCertsFromFile(pool, filepath.Join(dir, e.Name()))
	}
}
