-- name: GetRoleByName :one
SELECT id, name FROM roles WHERE name = $1;
