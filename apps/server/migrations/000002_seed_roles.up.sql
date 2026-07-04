INSERT INTO roles (name) VALUES ('user'), ('admin') ON CONFLICT (name) DO NOTHING;
