CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));

ALTER TABLE users ADD CONSTRAINT users_email_nonempty CHECK (length(btrim(email)) > 0);

CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

ALTER TABLE roles ADD CONSTRAINT roles_name_unique UNIQUE (name);

CREATE TABLE user_roles (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
