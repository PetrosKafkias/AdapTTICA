-- Workshop outputs previously had no file attachment at all — just a title
-- and free-text description, so the card the frontend rendered for each one
-- had nothing to actually open. These columns let a submission carry one
-- real uploaded file (PDF, Word doc, etc.), referencing the same uploads
-- table resources.js already uses for Knowledge Library attachments.
alter table workshop_outputs add column file_key text;
alter table workshop_outputs add column file_name text;
alter table workshop_outputs add column mime_type text;
alter table workshop_outputs add column byte_size integer;
