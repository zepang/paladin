-- name: AssignDefaultRole :exec
INSERT INTO user_roles (user_id, role_id)
SELECT $1, id FROM roles WHERE name = 'user'
ON CONFLICT DO NOTHING;

-- name: AssignRoleByName :exec
INSERT INTO user_roles (user_id, role_id)
SELECT $1, id FROM roles WHERE name = $2
ON CONFLICT DO NOTHING;

-- name: GetRolesByUserID :many
SELECT r.name FROM roles r
JOIN user_roles ur ON ur.role_id = r.id
WHERE ur.user_id = $1;
