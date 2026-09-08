-- The Prioritisation feature belongs to Explore Possible Futures, ranking
-- the actual Alternative Futures a coordinator/admin creates for the case --
-- not a fixed system taxonomy (system_priority_rankings, dropped below, was
-- the wrong target) and not a single pick (future_prioritisations, also
-- dropped, only ever stored one choice per user). One row per user per
-- future, ordered by rank_position, replaces both.
drop table if exists system_priority_rankings;

create table future_priority_rankings (
  case_id text not null references case_studies(id) on delete cascade,
  future_id text not null references alternative_futures(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  rank_position integer not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (case_id, user_id, future_id)
);
create index future_priority_rankings_future_idx on future_priority_rankings(future_id);

drop table future_prioritisations;
