package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	sqlcgen "paladin/apps/server/internal/db/sqlc"
)

type fakeAuditQuery struct {
	rows []sqlcgen.AuditLog
	last sqlcgen.ListAuditLogsCursorParams
}

func (f *fakeAuditQuery) ListAuditLogsCursor(ctx context.Context, arg sqlcgen.ListAuditLogsCursorParams) ([]sqlcgen.AuditLog, error) {
	f.last = arg
	filtered := make([]sqlcgen.AuditLog, 0, len(f.rows))
	for _, r := range f.rows {
		if arg.FilterUserID != nil && (r.UserID == nil || *arg.FilterUserID != *r.UserID) {
			continue
		}
		if arg.FilterAction != nil && r.Action != *arg.FilterAction {
			continue
		}
		if arg.FilterStatus != nil && r.Status != *arg.FilterStatus {
			continue
		}
		if arg.CursorTs.Valid {
			ct := arg.CursorTs.Time
			if r.CreatedAt.Time.After(ct) || (r.CreatedAt.Time.Equal(ct) && arg.CursorID != nil && r.ID >= *arg.CursorID) {
				continue
			}
		}
		filtered = append(filtered, r)
	}
	limit := int(arg.LimitCount)
	if limit <= 0 {
		limit = 50
	}
	if limit > len(filtered) {
		limit = len(filtered)
	}
	return filtered[:limit], nil
}

func newAuditEngine(q auditListQuery) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := &AuditHandler{q: q}
	r.GET("/admin/audit-logs", h.List)
	return r
}

func mkRow(id int64, action, status string, uid *int64, ts time.Time) sqlcgen.AuditLog {
	return sqlcgen.AuditLog{
		ID:        id,
		UserID:    uid,
		Action:    action,
		Status:    status,
		RequestIp: strPtr("1.2.3.4"),
		CreatedAt: pgtype.Timestamptz{Time: ts, Valid: true},
		Metadata:  []byte(`{"ip":"1.2.3.4","user_agent":"go-test"}`),
	}
}

func strPtr(s string) *string { return &s }

func TestListAudit_AdminRole_FirstPage(t *testing.T) {
	now := time.Now()
	fq := &fakeAuditQuery{rows: []sqlcgen.AuditLog{
		mkRow(3, "auth.login", "success", int64Ptr(1), now.Add(2*time.Second)),
		mkRow(2, "auth.login", "success", int64Ptr(1), now.Add(1*time.Second)),
		mkRow(1, "auth.register", "success", int64Ptr(1), now),
	}}
	r := newAuditEngine(fq)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin/audit-logs?limit=2", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp auditListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(resp.Items))
	}
	if resp.Items[0].ID != 3 {
		t.Errorf("expected newest first (id=3), got id=%d", resp.Items[0].ID)
	}
	if resp.NextCursor == nil {
		t.Error("expected next_cursor when more pages exist")
	}
}

func TestListAudit_OutOfRange_EmptyPage(t *testing.T) {
	fq := &fakeAuditQuery{}
	r := newAuditEngine(fq)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin/audit-logs?cursor=ZmFrZQ==", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp auditListResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Items) != 0 {
		t.Errorf("out-of-range cursor must return empty items, got %d", len(resp.Items))
	}
	if resp.NextCursor != nil {
		t.Error("empty page must have nil next_cursor")
	}
}

func TestListAudit_CursorChain(t *testing.T) {
	now := time.Now()
	fq := &fakeAuditQuery{rows: []sqlcgen.AuditLog{
		mkRow(3, "auth.login", "success", int64Ptr(1), now.Add(2*time.Second)),
		mkRow(2, "auth.login", "success", int64Ptr(1), now.Add(1*time.Second)),
	}}
	r := newAuditEngine(fq)

	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, httptest.NewRequest(http.MethodGet, "/admin/audit-logs?limit=1", nil))
	var resp1 auditListResponse
	json.Unmarshal(w1.Body.Bytes(), &resp1)
	if resp1.NextCursor == nil {
		t.Fatal("expected next_cursor on page 1")
	}

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/admin/audit-logs?limit=1&cursor="+*resp1.NextCursor, nil))
	var resp2 auditListResponse
	json.Unmarshal(w2.Body.Bytes(), &resp2)
	if len(resp2.Items) != 1 {
		t.Fatalf("page 2 expected 1 item, got %d", len(resp2.Items))
	}
	if resp2.Items[0].ID == resp1.Items[0].ID {
		t.Error("page 2 returned same item as page 1 (cursor not advancing)")
	}
}

func TestListAudit_FilterParamsPassedThrough(t *testing.T) {
	fq := &fakeAuditQuery{}
	r := newAuditEngine(fq)

	uid := "42"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/admin/audit-logs?user_id="+uid+"&action=auth.login&status=failure", nil))

	if fq.last.FilterUserID == nil || *fq.last.FilterUserID != 42 {
		t.Errorf("FilterUserID not passed: %v", fq.last.FilterUserID)
	}
	if fq.last.FilterAction == nil || *fq.last.FilterAction != "auth.login" {
		t.Errorf("FilterAction not passed: %v", fq.last.FilterAction)
	}
	if fq.last.FilterStatus == nil || *fq.last.FilterStatus != "failure" {
		t.Errorf("FilterStatus not passed: %v", fq.last.FilterStatus)
	}
}

func TestListAudit_RepeatCursor_Idempotent(t *testing.T) {
	now := time.Now()
	fq := &fakeAuditQuery{rows: []sqlcgen.AuditLog{
		mkRow(1, "auth.login", "success", int64Ptr(1), now),
	}}
	r := newAuditEngine(fq)

	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, httptest.NewRequest(http.MethodGet, "/admin/audit-logs?limit=1", nil))
	body1 := w1.Body.String()

	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/admin/audit-logs?limit=1", nil))
	body2 := w2.Body.String()

	if body1 != body2 {
		t.Error("repeating the same query must return the same page (idempotency edge)")
	}
}

func TestListAudit_NoSecretInResponse(t *testing.T) {
	now := time.Now()
	leak := mkRow(1, "auth.login", "success", int64Ptr(1), now)
	leak.Metadata = []byte(`{"password":"hunter2","token":"abc","ip":"1.2.3.4"}`)
	fq := &fakeAuditQuery{rows: []sqlcgen.AuditLog{leak}}
	r := newAuditEngine(fq)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/admin/audit-logs", nil))

	body := w.Body.String()
	if containsSecret(body, "hunter2") || containsSecret(body, "\"token\":\"abc\"") {
		t.Errorf("secret leaked into audit response: %s", body)
	}
}

func containsSecret(s, sub string) bool {
	return len(s) >= len(sub) && indexOf(s, sub) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func int64Ptr(n int64) *int64 { return &n }
