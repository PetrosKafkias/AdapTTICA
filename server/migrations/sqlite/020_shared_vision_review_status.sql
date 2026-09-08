-- Completes migration 019: the Shared Vision is one of the outputs the brief
-- puts through Draft -> In Review -> Validated, and it lives in its own table
-- rather than alongside the other co-creation outputs.
alter table shared_visions add column review_status text not null default 'draft'
  check (review_status in ('draft', 'in_review', 'validated'));
