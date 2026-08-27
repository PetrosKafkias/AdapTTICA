export async function audit(db, { actorId, action, entityType, entityId, metadata = {} }) {
  await db.run(
    "insert into audit_log (actor_id, action, entity_type, entity_id, metadata) values (?, ?, ?, ?, ?)",
    actorId || null,
    action,
    entityType,
    String(entityId),
    JSON.stringify(metadata)
  );
}
