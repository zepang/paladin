CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    request_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT audit_logs_status_chk CHECK (status IN ('success', 'failure')),
    CONSTRAINT audit_logs_action_nonempty_chk CHECK (btrim(action) <> '')
);

CREATE INDEX idx_audit_logs_created_at_id ON audit_logs (created_at DESC, id);
