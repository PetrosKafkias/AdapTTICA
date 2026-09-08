-- Pentsiou #13 asks for transformative potential to be weighed "κατά την
-- αξιολόγηση ενός future ή pathway" -- pathways already have the column,
-- futures did not, so the one place the documents name FIRST could not
-- record it at all. The journey doc's Alternative Futures list also names
-- "opportunities" alongside benefits/barriers/trade-offs.
alter table alternative_futures add column transformative_potential text not null default '{}';
alter table alternative_futures add column opportunities text not null default '{}';
