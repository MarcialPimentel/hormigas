-- Password reset codes (docs/12-ui-nest-view.md § Forgot your password).
-- The game has no emails, so an admin makes a one-time code for a player and sends it to them by hand.
-- New table only: nothing existing is changed or rewritten.
CREATE TABLE IF NOT EXISTS password_resets (
  player_id   int PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,          -- sha256 hex of the code (upper case, no dash)
  created_by  int REFERENCES players(id) ON DELETE SET NULL,
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL,
  tries       int NOT NULL DEFAULT 0  -- wrong guesses; the code is void after RESET_MAX_TRIES
);
