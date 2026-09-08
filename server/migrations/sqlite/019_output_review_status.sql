-- The brief defines one review lifecycle for every co-created output:
--   Draft -> In Review -> Validated
-- The tables already carry a `status` column, but it means something else in
-- each of them (proposed/merged/archived for contributions, draft/preferred/
-- combined for pathways) and drives merging and curation. Overloading it
-- would conflate "was this idea merged into another" with "has the region
-- validated this output", so review state gets its own column.
--
-- Everything already created is Draft: nothing has been through a review.

alter table alternative_futures add column review_status text not null default 'draft'
  check (review_status in ('draft', 'in_review', 'validated'));
alter table vision_elements add column review_status text not null default 'draft'
  check (review_status in ('draft', 'in_review', 'validated'));
alter table theory_of_change_entries add column review_status text not null default 'draft'
  check (review_status in ('draft', 'in_review', 'validated'));
alter table adaptation_options add column review_status text not null default 'draft'
  check (review_status in ('draft', 'in_review', 'validated'));
alter table pathways add column review_status text not null default 'draft'
  check (review_status in ('draft', 'in_review', 'validated'));
