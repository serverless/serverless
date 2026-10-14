// Command build-layer writes a Dev Mode layer zip with fixed timestamps and modes, so the same
// inputs always give the same bytes: the CLI keys published layer versions on the zip's sha256.
package main

import (
	"archive/zip"
	"bytes"
	"debug/buildinfo"
	"flag"
	"fmt"
	"os"
	"slices"
	"strings"
	"time"
)

var epoch = time.Date(1980, 1, 1, 0, 0, 0, 0, time.UTC)

type entry struct{ name, source string }

// noticesName is the zip entry holding the licences of what the bridge links. Lambda merges
// every layer into /opt, so it carries the sls-dev- prefix of the other entries.
const noticesName = "sls-dev-THIRD_PARTY_NOTICES"

func main() {
	bridge := flag.String("bridge", "", "path to the linux sls-dev-bridge binary")
	wrapper := flag.String("wrapper", "", "path to sls-dev-wrapper")
	notices := flag.String("notices", "", "path to sls-dev-THIRD_PARTY_NOTICES")
	out := flag.String("out", "", "zip file to write")
	flag.Parse()
	if *bridge == "" || *wrapper == "" || *notices == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "usage: build-layer -bridge <file> -wrapper <file> -notices <file> -out <zip>")
		os.Exit(2)
	}
	if err := run(*bridge, *wrapper, *notices, *out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// run checks the bridge and the notices, then writes the zip; nothing is written when a check
// fails.
func run(bridge, wrapper, notices, out string) error {
	if err := checkBridge(bridge); err != nil {
		return err
	}
	if err := checkNotices(bridge, notices); err != nil {
		return err
	}
	data, err := buildZip([]entry{{"bin/sls-dev-bridge", bridge}, {noticesName, notices}, {"sls-dev-wrapper", wrapper}})
	if err != nil {
		return err
	}
	return writeAtomic(out, data)
}

// checkBridge refuses a bridge binary whose bytes depend on the state of the source tree: Go embeds
// vcs.revision, vcs.time and vcs.modified unless built with -buildvcs=false, and -s -w do not strip
// them, so the zip's sha256 would change with every commit even when the bridge has not.
func checkBridge(path string) error {
	info, err := buildinfo.ReadFile(path)
	if err != nil {
		return fmt.Errorf("%s: not a Go binary with build information: %w", path, err)
	}
	for _, s := range info.Settings {
		if strings.HasPrefix(s.Key, "vcs") {
			return fmt.Errorf("%s carries VCS stamps (%s=%s); build it with -buildvcs=false", path, s.Key, s.Value)
		}
	}
	return nil
}

// goSection heads Go's own licence in the notices (cmd/notices writes the same line): the
// standard library and runtime are linked into every Go binary.
const goSection = "== Go standard library and runtime ==\n"

// checkNotices refuses a bridge that links a module the notices file does not list, or notices
// without Go's own licence: the layer ships the licences of everything in the binary.
func checkNotices(bridgePath, noticesPath string) error {
	info, err := buildinfo.ReadFile(bridgePath)
	if err != nil {
		return fmt.Errorf("%s: not a Go binary with build information: %w", bridgePath, err)
	}
	notices, err := os.ReadFile(noticesPath)
	if err != nil {
		return err
	}
	lines := map[string]bool{}
	for _, line := range strings.Split(string(notices), "\n") {
		lines[line] = true
	}
	var missing []string
	if !lines[strings.TrimSuffix(goSection, "\n")] {
		missing = append(missing, "the Go standard library and runtime")
	}
	for _, dep := range info.Deps {
		m := dep
		if dep.Replace != nil {
			m = dep.Replace
		}
		if !lines["== "+m.Path+" "+m.Version+" =="] {
			missing = append(missing, m.Path+" "+m.Version)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("%s does not list %s; run in dev-mode-bridge: go run ./cmd/notices -out layer/sls-dev-THIRD_PARTY_NOTICES", noticesPath, strings.Join(missing, ", "))
	}
	return nil
}

// writeAtomic writes data next to out and renames it into place, so an interrupted build never
// leaves a truncated zip behind for the CLI to hash and publish.
func writeAtomic(out string, data []byte) error {
	tmp := out + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, out); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

// buildZip writes the entries sorted by name, whatever order they are given in.
func buildZip(entries []entry) ([]byte, error) {
	entries = slices.Clone(entries)
	slices.SortFunc(entries, func(a, b entry) int { return strings.Compare(a.name, b.name) })
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		content, err := os.ReadFile(e.source)
		if err != nil {
			return nil, err
		}
		if strings.HasSuffix(e.name, "wrapper") && bytes.ContainsRune(content, '\r') {
			return nil, fmt.Errorf("%s has CR line endings; bash in Lambda cannot run it", e.source)
		}
		if e.name == noticesName && bytes.ContainsRune(content, '\r') {
			return nil, fmt.Errorf("%s has CR line endings; regenerate it (go run ./cmd/notices) or check it out with LF", e.source)
		}
		h := &zip.FileHeader{Name: e.name, Method: zip.Deflate, Modified: epoch}
		if e.name == noticesName {
			h.SetMode(0o644)
		} else {
			h.SetMode(0o755)
		}
		w, err := zw.CreateHeader(h)
		if err != nil {
			return nil, err
		}
		if _, err := w.Write(content); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
