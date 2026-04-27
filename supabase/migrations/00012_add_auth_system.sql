-- Auth system: Google OAuth + email whitelist + 4-role RBAC.
--
-- Two tables:
--   profiles         — one row per user who has logged in. PK = auth.users.id.
--                      Holds role + display info copied from Google identity.
--   email_whitelist  — admin-managed pre-authorisation list. Email is PK, role
--                      is the role assigned at first sign-in.
--
-- Trigger on_auth_user_created reads email_whitelist on first sign-in:
--   - email in whitelist  → create profile with that role
--   - email not in list   → no profile created; app middleware signs the user
--                           out and shows the no-access page
--
-- RLS: profiles readable by self + admins; email_whitelist admin-only.
-- The service-role key (used by /api routes) bypasses RLS, so server code
-- can still read freely; user-facing queries from client must respect RLS.

-- 0. clean up any orphan profiles/user_role from earlier draft schemas
--    (the live DB had an unmigrated profiles table + user_role enum that
--    didn't match our final design; safe to drop because it had 0 rows).
DROP TABLE IF EXISTS profiles CASCADE;
DROP TYPE  IF EXISTS user_role;

-- 1. profiles --------------------------------------------------------------

CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'editor', 'pm', 'viewer')),
  last_sign_in_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(LOWER(email));

COMMENT ON TABLE profiles IS
  'One row per authenticated user. Linked 1:1 to auth.users. Role determines permissions across the app.';
COMMENT ON COLUMN profiles.role IS
  'admin = full access incl. user mgmt; editor = MKT (edit content + generate); pm = review/approve only; viewer = read-only + Ask.';

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION profiles_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at_trigger ON profiles;
CREATE TRIGGER profiles_updated_at_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_set_updated_at();

-- 2. email_whitelist -------------------------------------------------------

CREATE TABLE IF NOT EXISTS email_whitelist (
  email       TEXT PRIMARY KEY,
  role        TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'editor', 'pm', 'viewer')),
  invited_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note        TEXT
);

COMMENT ON TABLE email_whitelist IS
  'Pre-authorised emails. Admin adds rows here; first matching Google sign-in creates a profile with the listed role.';

-- 3. RLS -------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_whitelist ENABLE ROW LEVEL SECURITY;

-- profiles: anyone authenticated can read their own row
DROP POLICY IF EXISTS "users read own profile" ON profiles;
CREATE POLICY "users read own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- profiles: admins can read all rows
DROP POLICY IF EXISTS "admin read all profiles" ON profiles;
CREATE POLICY "admin read all profiles" ON profiles
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- profiles: admins can update any row (for role changes)
DROP POLICY IF EXISTS "admin update profiles" ON profiles;
CREATE POLICY "admin update profiles" ON profiles
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- profiles: admins can delete (for "Remove user")
DROP POLICY IF EXISTS "admin delete profiles" ON profiles;
CREATE POLICY "admin delete profiles" ON profiles
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- email_whitelist: admin-only for everything
DROP POLICY IF EXISTS "admin manage whitelist" ON email_whitelist;
CREATE POLICY "admin manage whitelist" ON email_whitelist
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Trigger: on first sign-in, create profile from whitelist --------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wl_role TEXT;
BEGIN
  SELECT role INTO wl_role
    FROM email_whitelist
    WHERE LOWER(email) = LOWER(NEW.email);

  IF wl_role IS NULL THEN
    -- Not whitelisted: do not create a profile. Middleware will catch the
    -- missing profile on next request and sign the user out.
    RETURN NEW;
  END IF;

  INSERT INTO profiles (id, email, name, avatar_url, role, last_sign_in_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    wl_role,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    last_sign_in_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 5. Seed initial admin + editor whitelist ---------------------------------
-- These are the people we know need access on day one. Anyone else is
-- added via /settings/users (admin UI) once an admin has logged in.

INSERT INTO email_whitelist (email, role, note) VALUES
  ('terrel.yeh@gmail.com',   'admin',  'initial admin'),
  ('marketing@engenius.ai',  'admin',  'initial admin'),
  ('engenius.ad@gmail.com',  'admin',  'initial admin'),
  ('emily78329@gmail.com',   'editor', 'initial editor'),
  ('jillophielia@gmail.com', 'editor', 'initial editor'),
  ('sputnik0913@gmail.com',  'editor', 'initial editor'),
  ('wxli0704@gmail.com',     'editor', 'initial editor'),
  ('lululi2012@gmail.com',   'editor', 'initial editor')
ON CONFLICT (email) DO NOTHING;
