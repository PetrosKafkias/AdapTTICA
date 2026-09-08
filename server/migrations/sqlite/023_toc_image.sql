-- The Theory of Change step is being simplified to an image attachment plus
-- a description, curator/admin-authored -- not the auto-populated Current
-- State / Desired Future bridge. image_key references the shared uploads
-- table (server/src/routes/uploads.js), the same mechanism workshop outputs
-- already use.
alter table theory_of_change_entries add column image_key text references uploads(id) on delete set null;
