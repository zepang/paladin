package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"

	"paladin/apps/server/internal/audit"
	sqlcgen "paladin/apps/server/internal/db/sqlc"
	"paladin/apps/server/internal/http/middleware"
)

type auditListQuery interface {
	ListAuditLogsCursor(ctx context.Context, arg sqlcgen.ListAuditLogsCursorParams) ([]sqlcgen.AuditLog, error)
}

type AuditHandler struct {
	q auditListQuery
}

func NewAuditHandler(q *sqlcgen.Queries) *AuditHandler {
	return &AuditHandler{q: q}
}

type auditLogItem struct {
	ID        int64           `json:"id"`
	UserID    *int64          `json:"user_id"`
	Action    string          `json:"action"`
	Status    string          `json:"status"`
	RequestIP *string         `json:"request_ip"`
	CreatedAt string          `json:"created_at"`
	Metadata  json.RawMessage `json:"metadata"`
}

type auditListResponse struct {
	Items      []auditLogItem `json:"items"`
	NextCursor *string        `json:"next_cursor"`
}

const (
	defaultAuditPageSize = 50
	maxAuditPageSize     = 100
)

func (h *AuditHandler) List(c *gin.Context) {
	limit := defaultAuditPageSize
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxAuditPageSize {
		limit = maxAuditPageSize
	}

	var cursorTs pgtype.Timestamptz
	var cursorID *int64
	if raw := c.Query("cursor"); raw != "" {
		decoded, err := base64.URLEncoding.DecodeString(raw)
		if err == nil {
			parts := strings.SplitN(string(decoded), "|", 2)
			if len(parts) == 2 {
				if t, err := time.Parse(time.RFC3339Nano, parts[0]); err == nil {
					cursorTs = pgtype.Timestamptz{Time: t, Valid: true}
				}
				if id, err := strconv.ParseInt(parts[1], 10, 64); err == nil {
					cursorID = &id
				}
			}
		}
	}

	params := sqlcgen.ListAuditLogsCursorParams{
		CursorTs:   cursorTs,
		CursorID:   cursorID,
		LimitCount: int32(limit),
	}

	if v := c.Query("user_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			params.FilterUserID = &id
		}
	}
	if v := c.Query("action"); v != "" {
		params.FilterAction = &v
	}
	if v := c.Query("status"); v != "" {
		params.FilterStatus = &v
	}

	rows, err := h.q.ListAuditLogsCursor(c.Request.Context(), params)
	if err != nil {
		middleware.WriteError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		return
	}

	items := make([]auditLogItem, 0, len(rows))
	for _, row := range rows {
		var stored map[string]any
		if len(row.Metadata) > 0 {
			_ = json.Unmarshal(row.Metadata, &stored)
		}
		redacted := audit.FilterMetadata(row.Action, stored)
		cleanBytes, err := json.Marshal(redacted)
		if err != nil {
			cleanBytes = []byte("{}")
		}
		items = append(items, auditLogItem{
			ID:        row.ID,
			UserID:    row.UserID,
			Action:    row.Action,
			Status:    row.Status,
			RequestIP: row.RequestIp,
			CreatedAt: row.CreatedAt.Time.Format(time.RFC3339Nano),
			Metadata:  cleanBytes,
		})
	}

	var nextCursor *string
	if len(items) >= limit && len(items) > 0 {
		last := items[len(items)-1]
		token := base64.URLEncoding.EncodeToString([]byte(last.CreatedAt + "|" + strconv.FormatInt(last.ID, 10)))
		nextCursor = &token
	}

	c.JSON(http.StatusOK, auditListResponse{Items: items, NextCursor: nextCursor})
}
