-- In-game feedback is also posted to GitHub as issues (server/src/game/feedbackGithub.ts).
-- Additive only: safe on the live world. NULL = not posted yet.
ALTER TABLE feedback ADD COLUMN github_issue int;
CREATE INDEX feedback_unposted ON feedback (id) WHERE github_issue IS NULL AND NOT handled;
