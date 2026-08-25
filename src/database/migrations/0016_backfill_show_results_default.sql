-- Custom SQL migration file, put your code below! --
-- Migration 0015 flipped show_results' DEFAULT to false for newly-inserted rows only — it left
-- every quiz created before that migration ran at whatever value it already had, which was
-- `true` for any quiz a teacher never explicitly touched, since `true` was the only default that
-- ever existed until 0015. That's not a deliberate teacher choice to expose answer review; it's
-- every pre-existing quiz silently inheriting the old, insecure default. Backfilling all of them
-- to false brings every quiz already in the database in line with the "hidden until a teacher
-- releases it" posture 0015/42feeb9 established for new ones — a teacher who does want review
-- visible can still turn it back on immediately via the release-results toggle.
UPDATE "quizzes" SET "show_results" = false WHERE "show_results" = true;