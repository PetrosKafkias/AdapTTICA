-- Generalise the Baseline comment/suggestion thread into a reusable
-- section-scoped thread, reused by the Theory of Change step (both need
-- the exact same propose/mark-as-suggestion/accept/reject shape).
alter table baseline_comments rename to section_comments;
alter table section_comments add column section text not null default 'baseline';

drop index if exists baseline_comments_case_idx;
create index section_comments_case_idx on section_comments(case_id, section, created_at);
