package hello

import (
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHello(t *testing.T) {
	tests := map[string]struct {
		name       string
		wantStatus int
		wantString string
	}{
		"name specified":     {"jdoe", http.StatusOK, "Hello, jdoe!"},
		"name not specified": {"", http.StatusOK, "Hello, someone!"},
	}

	for name, te := range tests {
		t.Run(name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			q := r.URL.Query()
			q.Add("name", te.name)
			r.URL.RawQuery = q.Encode()

			Hello(w, r)

			rw := w.Result()
			defer rw.Body.Close()
			if s := rw.StatusCode; s != te.wantStatus {
				t.Fatalf("got: %d, want: %d", s, te.wantStatus)
			}
			b, err := ioutil.ReadAll(rw.Body)
			if err != nil {
				t.Fatal("failed to read res body")
			}
			if s := string(b); s != te.wantString {
				t.Fatalf("got: %s, want: %s", s, te.wantString)
			}
		})
	}
}
