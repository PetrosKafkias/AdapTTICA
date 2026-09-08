-- Phase 2 needs to show how many participants come from each stakeholder
-- category (Public Sector, Private Sector, Civil Society, Research &
-- Academia) without exposing who they are. That category is a property of
-- the person, not of a single case membership, so it lives on users.
alter table users add column stakeholder_category text
  check (stakeholder_category in ('public', 'private', 'civil', 'research') or stakeholder_category is null);
