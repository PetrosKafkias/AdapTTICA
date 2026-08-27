-- The "Workshop outputs" tab on a case's page (public/assets bundle,
-- .workshop-output-section) renders three permanently hardcoded demo cards
-- with no data binding of any kind, and its "New workshop output" button
-- only ever shows a toast saying the feature isn't built. This table plus
-- server/src/routes/workshopOutputs.js is the real backend for that
-- feature; the frontend patch in runtime-enhancements.js adds real
-- creation and injects real items into the same .output-grid the demo
-- cards live in.
create table workshop_outputs (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  workshop_label text not null default '',
  title text not null,
  description text not null default '{}',
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'changes_requested')),
  created_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index workshop_outputs_case_idx on workshop_outputs(case_id, updated_at desc);
