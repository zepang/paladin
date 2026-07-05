-- name: InsertAuditLog :one
INSERT INTO audit_logs (user_id, action, status, request_ip, metadata)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, user_id, action, status, request_ip, created_at, metadata;

-- name: ListAuditLogsCursor :many
SELECT id, user_id, action, status, request_ip, created_at, metadata
FROM audit_logs
WHERE
    (sqlc.narg('cursor_ts')::timestamptz IS NULL OR created_at < sqlc.narg('cursor_ts') OR (created_at = sqlc.narg('cursor_ts') AND id < sqlc.narg('cursor_id')))
    AND (sqlc.narg('filter_user_id')::bigint IS NULL OR user_id = sqlc.narg('filter_user_id'))
    AND (sqlc.narg('filter_action')::text IS NULL OR action = sqlc.narg('filter_action'))
    AND (sqlc.narg('filter_status')::text IS NULL OR status = sqlc.narg('filter_status'))
ORDER BY created_at DESC, id DESC
LIMIT @limit_count;
