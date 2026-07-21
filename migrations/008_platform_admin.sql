ALTER TABLE users ADD COLUMN platform_role text NOT NULL DEFAULT 'USER' CHECK(platform_role IN ('USER','ADMIN'));
CREATE INDEX users_platform_admin_idx ON users(platform_role) WHERE platform_role='ADMIN';
