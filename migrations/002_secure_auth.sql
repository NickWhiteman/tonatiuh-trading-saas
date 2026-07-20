ALTER TABLE users ADD COLUMN display_name text;
ALTER TABLE users ADD CONSTRAINT users_display_name_length CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 120);
CREATE INDEX refresh_tokens_user_family_idx ON refresh_tokens(user_id, family_id);
CREATE INDEX refresh_tokens_expiry_idx ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
