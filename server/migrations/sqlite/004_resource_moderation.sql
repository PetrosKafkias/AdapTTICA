-- Knowledge Library moderation workflow: every new submission starts
-- pending_review and is only publicly visible once approved. Existing
-- rows (all previously auto-published) are backfilled to 'approved' via
-- the column DEFAULT itself, so no separate UPDATE is needed.
alter table resources add column status text not null default 'approved'
  check (status in ('pending_review', 'approved', 'changes_requested', 'rejected'));

-- Fixed licence list (mirrors the check-constraint pattern used elsewhere
-- in this schema, e.g. case_studies.status, rather than a lookup table for
-- a small closed set). 'other' + licence_other covers "Other/Custom".
alter table resources add column licence text not null default 'other'
  check (licence in ('CC-BY-4.0','CC-BY-SA-4.0','CC-BY-NC-4.0','CC0-1.0','MIT','GPL','other'));
alter table resources add column licence_other text;

-- Moderation audit trail.
alter table resources add column moderated_by text;
alter table resources add column moderated_at text;
alter table resources add column moderation_note text;

create index resources_status_idx on resources(status, published_at desc);
create index resources_author_idx on resources(author_id, status);
