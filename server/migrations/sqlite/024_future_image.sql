-- A Possible Future's creation form is now just Title, Description and an
-- optional image (Benefits/Barriers stay as display-only fields for
-- existing content, but are no longer collected). image_key references the
-- shared uploads table, same mechanism as the Theory of Change image.
alter table alternative_futures add column image_key text references uploads(id) on delete set null;
