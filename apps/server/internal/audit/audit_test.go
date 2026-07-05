package audit

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	sqlcgen "paladin/apps/server/internal/db/sqlc"
)

type fakeInserter struct {
	mu       sync.Mutex
	rows     []sqlcgen.AuditLog
	inserted []sqlcgen.InsertAuditLogParams
	err      error
}

func (f *fakeInserter) InsertAuditLog(ctx context.Context, arg sqlcgen.InsertAuditLogParams) (sqlcgen.AuditLog, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return sqlcgen.AuditLog{}, f.err
	}
	f.inserted = append(f.inserted, arg)
	row := sqlcgen.AuditLog{
		ID:        int64(len(f.rows) + 1),
		UserID:    arg.UserID,
		Action:    arg.Action,
		Status:    arg.Status,
		RequestIp: arg.RequestIp,
		Metadata:  arg.Metadata,
	}
	f.rows = append(f.rows, row)
	return row, nil
}

func TestFilterMetadata_DropsNonAllowlisted(t *testing.T) {
	out := FilterMetadata("auth.login", map[string]any{
		"ip":         "1.2.3.4",
		"password":   "hunter2",
		"token":      "abc",
		"user_agent": "go-test",
	})
	if _, present := out["password"]; present {
		t.Fatalf("password key must be dropped, got %v", out)
	}
	if _, present := out["token"]; present {
		t.Fatalf("token key must be dropped, got %v", out)
	}
	if out["ip"] != "1.2.3.4" || out["user_agent"] != "go-test" {
		t.Fatalf("allowlisted keys dropped: %v", out)
	}
}

func TestFilterMetadata_UnknownActionEmpty(t *testing.T) {
	out := FilterMetadata("unknown.foo", map[string]any{"password": "x"})
	if len(out) != 0 {
		t.Fatalf("unknown action must yield empty metadata, got %v", out)
	}
}

func TestRecorder_PasswordKeyNotStored(t *testing.T) {
	fi := &fakeInserter{}
	r := NewRecorder(fi)
	uid := int64(42)
	if err := r.Record(context.Background(), Record{
		UserID:    &uid,
		Action:    "auth.login",
		Status:    "success",
		RequestIP: "1.2.3.4",
		Metadata:  map[string]any{"password": "hunter2", "ip": "1.2.3.4"},
	}); err != nil {
		t.Fatalf("Record failed: %v", err)
	}
	if len(fi.inserted) != 1 {
		t.Fatalf("expected 1 insert, got %d", len(fi.inserted))
	}
	var stored map[string]any
	if err := json.Unmarshal(fi.inserted[0].Metadata, &stored); err != nil {
		t.Fatalf("metadata not valid JSON: %v", err)
	}
	if _, present := stored["password"]; present {
		t.Fatalf("password leaked into metadata: %v", stored)
	}
}

func TestRecorder_NullUserID_OK(t *testing.T) {
	fi := &fakeInserter{}
	r := NewRecorder(fi)
	if err := r.Record(context.Background(), Record{
		UserID:   nil,
		Action:   "auth.login",
		Status:   "failure",
		Metadata: map[string]any{"ip": "1.2.3.4"},
	}); err != nil {
		t.Fatalf("Record with null user_id failed: %v", err)
	}
	if fi.inserted[0].UserID != nil {
		t.Fatalf("expected nil user_id, got %v", fi.inserted[0].UserID)
	}
}

func TestRecorder_InsertError(t *testing.T) {
	fi := &fakeInserter{err: errors.New("db down")}
	r := NewRecorder(fi)
	uid := int64(1)
	if err := r.Record(context.Background(), Record{UserID: &uid, Action: "auth.login", Status: "success"}); err == nil {
		t.Fatal("expected error from insert failure")
	}
}

func TestRecorder_ConcurrentInsertsNoLoss(t *testing.T) {
	fi := &fakeInserter{}
	r := NewRecorder(fi)
	const n = 100
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			_ = r.Record(context.Background(), Record{
				Action:   "auth.login",
				Status:   "success",
				Metadata: map[string]any{"ip": "1.2.3.4"},
			})
		}()
	}
	wg.Wait()
	if len(fi.inserted) != n {
		t.Fatalf("expected %d inserts, got %d (lost under concurrency)", n, len(fi.inserted))
	}
}

func TestRecorder_AppendOnlyNoUpdateDeleteMethods(t *testing.T) {
	var r interface{} = &Recorder{}
	_ = r
	switch v := r.(type) {
	case interface{ Update(context.Context) error }:
		_ = v
		t.Fatal("Recorder MUST NOT expose an Update method (append-only constraint)")
	case interface{ Delete(context.Context) error }:
		_ = v
		t.Fatal("Recorder MUST NOT expose a Delete method (append-only constraint)")
	}
}
