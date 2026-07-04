package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakePinger struct {
	err error
}

func (f fakePinger) Ping(ctx context.Context) error {
	return f.err
}

type errPinger struct{}

func (errPinger) Ping(ctx context.Context) error { return context.DeadlineExceeded }

func setupRouter(h *HealthHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/healthz", h.Liveness)
	r.GET("/readyz", h.Ready)
	return r
}

func TestLiveness_AlwaysOK(t *testing.T) {
	h := NewHealthHandlerWithPingers(fakePinger{}, fakePinger{})
	r := setupRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status body = %q, want %q", body["status"], "ok")
	}
}

func TestReady_BothUp_200(t *testing.T) {
	h := NewHealthHandlerWithPingers(fakePinger{}, fakePinger{})
	r := setupRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body struct {
		Status map[string]string `json:"status"`
		OK     bool              `json:"ok"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !body.OK {
		t.Errorf("ok = false, want true")
	}
	if body.Status["postgres"] != "up" {
		t.Errorf("postgres = %q, want up", body.Status["postgres"])
	}
	if body.Status["redis"] != "up" {
		t.Errorf("redis = %q, want up", body.Status["redis"])
	}
}

func TestReady_PostgresDown_503(t *testing.T) {
	h := NewHealthHandlerWithPingers(errPinger{}, fakePinger{})
	r := setupRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
	var body struct {
		Status map[string]string `json:"status"`
		OK     bool              `json:"ok"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.OK {
		t.Errorf("ok = true, want false")
	}
	if body.Status["postgres"] != "down" {
		t.Errorf("postgres = %q, want down", body.Status["postgres"])
	}
}

func TestReady_RedisDown_503(t *testing.T) {
	h := NewHealthHandlerWithPingers(fakePinger{}, errPinger{})
	r := setupRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
	var body struct {
		Status map[string]string `json:"status"`
		OK     bool              `json:"ok"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.OK {
		t.Errorf("ok = true, want false")
	}
	if body.Status["redis"] != "down" {
		t.Errorf("redis = %q, want down", body.Status["redis"])
	}
}

func TestReady_Concurrent_Stable(t *testing.T) {
	h := NewHealthHandlerWithPingers(fakePinger{}, fakePinger{})
	r := setupRouter(h)

	var wg sync.WaitGroup
	firstBody := []byte{}
	var mu sync.Mutex
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Errorf("goroutine %d: status = %d, want 200", idx, w.Code)
			}
			mu.Lock()
			defer mu.Unlock()
			if len(firstBody) == 0 {
				firstBody = make([]byte, len(w.Body.Bytes()))
				copy(firstBody, w.Body.Bytes())
			} else {
				if string(firstBody) != w.Body.String() {
					t.Errorf("goroutine %d: body differs from first", idx)
				}
			}
		}(i)
	}
	wg.Wait()
}
