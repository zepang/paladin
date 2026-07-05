package audit

import (
	"context"
	"encoding/json"
	"time"

	sqlcgen "paladin/apps/server/internal/db/sqlc"
)

type AuditInserter interface {
	InsertAuditLog(ctx context.Context, arg sqlcgen.InsertAuditLogParams) (sqlcgen.AuditLog, error)
}

type Record struct {
	UserID    *int64
	Action    string
	Status    string
	RequestIP string
	Metadata  map[string]any
}

type AdminNotifier interface {
	SendToRole(role string, payload map[string]any) int
}

type Recorder struct {
	q        AuditInserter
	notifier AdminNotifier
}

func NewRecorder(q AuditInserter) *Recorder {
	return &Recorder{q: q}
}

func (r *Recorder) WithNotifier(n AdminNotifier) *Recorder {
	r.notifier = n
	return r
}

var allowlists = map[string]map[string]bool{
	"auth.login":     {"ip": true, "user_agent": true},
	"auth.register":  {"ip": true, "user_agent": true},
	"rbac.deny":      {"ip": true, "path": true, "method": true},
	"quota.exceeded": {"ip": true, "used": true, "limit": true, "reset_at": true},
}

func FilterMetadata(action string, in map[string]any) map[string]any {
	allowed, ok := allowlists[action]
	if !ok {
		return map[string]any{}
	}
	out := make(map[string]any, len(allowed))
	for k := range allowed {
		if v, present := in[k]; present {
			out[k] = v
		}
	}
	return out
}

func (r *Recorder) Record(ctx context.Context, rec Record) error {
	filtered := FilterMetadata(rec.Action, rec.Metadata)
	raw, err := json.Marshal(filtered)
	if err != nil {
		raw = []byte("{}")
	}

	var uidPtr *int64
	if rec.UserID != nil {
		v := *rec.UserID
		uidPtr = &v
	}
	var ipPtr *string
	if rec.RequestIP != "" {
		ipPtr = &rec.RequestIP
	}

	row, err := r.q.InsertAuditLog(ctx, sqlcgen.InsertAuditLogParams{
		UserID:    uidPtr,
		Action:    rec.Action,
		Status:    rec.Status,
		RequestIp: ipPtr,
		Metadata:  raw,
	})
	if err != nil {
		return err
	}

	if r.notifier != nil {
		payload := map[string]any{
			"id":         row.ID,
			"action":     row.Action,
			"status":     row.Status,
			"user_id":    uidPtr,
			"ip":         rec.RequestIP,
			"created_at": row.CreatedAt.Time.Format(time.RFC3339),
		}
		go r.notifier.SendToRole("admin", payload)
	}
	return nil
}
