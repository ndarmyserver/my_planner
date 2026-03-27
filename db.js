/* ═══════════════════════════════════════════════
   FIRESTORE PERSISTENCE LAYER
   ═══════════════════════════════════════════════ */

const DB = {

  /* ─── User document ─── */

  async ensureUserDoc(userId) {
    const ref = db.collection('users').doc(userId);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        email: auth.currentUser ? auth.currentUser.email : '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  },

  /* ─── Settings ─── */

  async loadSettings(userId) {
    const snap = await db.collection('users').doc(userId)
      .collection('settings').doc('settings').get();
    return snap.exists ? snap.data() : null;
  },

  async saveSettings(userId, settingsObj) {
    const doc = { ...settingsObj };
    // Store channels alongside settings for per-user customization
    doc.channels = CHANNELS.map(ch => ({ ...ch }));
    // Remove transient runtime fields
    delete doc._profileObjectUrl;
    await db.collection('users').doc(userId)
      .collection('settings').doc('settings').set(doc);
  },

  /* ─── Tasks ─── */

  async loadTasksForDateRange(userId, startISO, endISO) {
    const snap = await db.collection('users').doc(userId)
      .collection('tasks')
      .where('columnDate', '>=', startISO)
      .where('columnDate', '<=', endISO)
      .orderBy('columnDate')
      .orderBy('orderIndex')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async saveTask(userId, taskDoc) {
    const ref = db.collection('users').doc(userId)
      .collection('tasks').doc(taskDoc.id);
    const doc = { ...taskDoc, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    delete doc.id; // don't store id inside the document
    await ref.set(doc, { merge: true });
  },

  async updateTaskFields(userId, taskId, fields) {
    fields.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection('users').doc(userId)
      .collection('tasks').doc(taskId).update(fields);
  },

  async deleteTask(userId, taskId) {
    await db.collection('users').doc(userId)
      .collection('tasks').doc(taskId).delete();
  },

  async reorderTasks(userId, updates) {
    const batch = db.batch();
    for (const { taskId, orderIndex } of updates) {
      const ref = db.collection('users').doc(userId)
        .collection('tasks').doc(taskId);
      batch.update(ref, { orderIndex, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    await batch.commit();
  },

  /* ─── Calendar Events ─── */

  async loadCalendarEvents(userId, dateISO) {
    const snap = await db.collection('users').doc(userId)
      .collection('calendarEvents')
      .where('date', '==', dateISO)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async loadCalendarEventsForRange(userId, startISO, endISO) {
    const snap = await db.collection('users').doc(userId)
      .collection('calendarEvents')
      .where('date', '>=', startISO)
      .where('date', '<=', endISO)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async saveCalendarEvent(userId, event) {
    const ref = db.collection('users').doc(userId)
      .collection('calendarEvents').doc(event.id);
    const doc = { ...event, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    delete doc.id;
    await ref.set(doc, { merge: true });
  },

  async deleteCalendarEvent(userId, eventId) {
    await db.collection('users').doc(userId)
      .collection('calendarEvents').doc(eventId).delete();
  },

  /* ─── Trash ─── */

  async loadTrash(userId) {
    const snap = await db.collection('users').doc(userId)
      .collection('trash')
      .orderBy('deletedAt', 'desc')
      .limit(100)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async addToTrash(userId, entry) {
    const ref = db.collection('users').doc(userId)
      .collection('trash').doc(entry.id);
    const doc = { ...entry, deletedAt: firebase.firestore.FieldValue.serverTimestamp() };
    delete doc.id;
    await ref.set(doc);
  },

  async removeFromTrash(userId, entryId) {
    await db.collection('users').doc(userId)
      .collection('trash').doc(entryId).delete();
  },

  /* ─── Rituals ─── */

  async loadRituals(userId) {
    const snap = await db.collection('users').doc(userId)
      .collection('rituals').doc('rituals').get();
    return snap.exists ? snap.data() : null;
  },

  async saveRituals(userId, ritualsObj) {
    await db.collection('users').doc(userId)
      .collection('rituals').doc('rituals').set(ritualsObj);
  },

  /* ─── Backlog ─── */

  async loadBacklog(userId) {
    const snap = await db.collection('users').doc(userId)
      .collection('tasks')
      .where('columnDate', '==', '__backlog__')
      .orderBy('orderIndex')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async loadArchive(userId) {
    const snap = await db.collection('users').doc(userId)
      .collection('tasks')
      .where('columnDate', '==', '__archive__')
      .orderBy('orderIndex')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};
