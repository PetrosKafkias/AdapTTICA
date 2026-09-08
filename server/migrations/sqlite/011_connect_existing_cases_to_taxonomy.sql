-- Data migration for databases created before the Priority System journey
-- was connected to Case Studies. Fresh databases are also populated by the
-- idempotent seed; these conditional inserts make an existing installation
-- useful immediately when an Administrator is already present.

insert or ignore into impacts (id, system_id, title, description, created_by)
select '10000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000004',
       '{"el":"Αστικές πλημμύρες","en":"Urban Flooding"}',
       '{"el":"Πλημμυρικός κίνδυνος στο δομημένο περιβάλλον.","en":"Flood risk affecting the built environment."}', id
from users where platform_role = 'admin' order by created_at limit 1;

insert or ignore into impacts (id, system_id, title, description, created_by)
select '10000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000004',
       '{"el":"Αστική θερμική επιβάρυνση","en":"Urban Heat"}',
       '{"el":"Έκθεση σε ακραία ζέστη.","en":"Exposure to extreme heat."}', id
from users where platform_role = 'admin' order by created_at limit 1;

insert or ignore into impacts (id, system_id, title, description, created_by)
select '10000000-0000-4000-8000-000000000003',
       '00000000-0000-4000-8000-000000000008',
       '{"el":"Παράκτια διάβρωση","en":"Coastal Erosion"}',
       '{"el":"Διάβρωση και πλημμύρες σε παράκτιες ζώνες.","en":"Erosion and flooding affecting coastal zones."}', id
from users where platform_role = 'admin' order by created_at limit 1;

insert or ignore into impacts (id, system_id, title, description, created_by)
select '10000000-0000-4000-8000-000000000004',
       '00000000-0000-4000-8000-000000000002',
       '{"el":"Κίνδυνος δασικών πυρκαγιών","en":"Wildfire Risk"}',
       '{"el":"Κίνδυνος πυρκαγιάς και αποκατάσταση οικοσυστημάτων.","en":"Wildfire risk and ecosystem recovery."}', id
from users where platform_role = 'admin' order by created_at limit 1;

insert or ignore into impact_hazards
select '10000000-0000-4000-8000-000000000001','00000000-0000-4000-9000-000000000002'
where exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000001');
insert or ignore into impact_hazards
select '10000000-0000-4000-8000-000000000002','00000000-0000-4000-9000-000000000001'
where exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000002');
insert or ignore into impact_hazards
select '10000000-0000-4000-8000-000000000003', id from hazards where id in
('00000000-0000-4000-9000-000000000005','00000000-0000-4000-9000-000000000002')
and exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000003');
insert or ignore into impact_hazards
select '10000000-0000-4000-8000-000000000004', id from hazards where id in
('00000000-0000-4000-9000-000000000004','00000000-0000-4000-9000-000000000003')
and exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000004');

insert or ignore into impact_linked_systems
select '10000000-0000-4000-8000-000000000001', id from systems where id in
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000010')
and exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000001');
insert or ignore into impact_linked_systems
select '10000000-0000-4000-8000-000000000002', id from systems where id in
('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000006')
and exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000002');
insert or ignore into impact_linked_systems
select '10000000-0000-4000-8000-000000000003', id from systems where id in
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000010')
and exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000003');
insert or ignore into impact_linked_systems
select '10000000-0000-4000-8000-000000000004', id from systems where id in
('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000003')
and exists (select 1 from impacts where id = '10000000-0000-4000-8000-000000000004');

update case_studies set impact_id = '10000000-0000-4000-8000-000000000002'
where lower(json_extract(title, '$.en')) like '%heat%';
update case_studies set impact_id = '10000000-0000-4000-8000-000000000001'
where lower(json_extract(title, '$.en')) like '%flood%' or lower(json_extract(title, '$.en')) like '%mandra%';
update case_studies set impact_id = '10000000-0000-4000-8000-000000000003'
where lower(json_extract(title, '$.en')) like '%coastal%';
update case_studies set impact_id = '10000000-0000-4000-8000-000000000004'
where lower(json_extract(title, '$.en')) like '%forest%' or lower(json_extract(title, '$.en')) like '%wildfire%';

create index if not exists case_linked_systems_system_idx on case_linked_systems(system_id, case_id);
create index if not exists pathway_linked_systems_system_idx on pathway_linked_systems(system_id, pathway_id);
