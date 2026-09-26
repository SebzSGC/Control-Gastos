const db = require('../config/db');
const { sanitizeGroupId } = require('../routes/nfc.routes');

function setupSocketHandler(io) {
  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join_group', (groupId) => {
      const cleanGroupId = sanitizeGroupId(groupId);
      if (cleanGroupId) {
        socket.join(cleanGroupId);
        console.log(`User ${socket.id} joined group ${cleanGroupId}`);
      }
    });

    socket.on('nfc_joined', (data) => {
      const groupId = sanitizeGroupId(data?.groupId);
      const profileName = (data?.profileName && typeof data.profileName === 'string') 
        ? data.profileName.trim().slice(0, 50) 
        : 'Nuevo integrante';

      if (groupId) {
        socket.to(groupId).emit('peer_joined_nfc', {
          message: `¡${profileName} se ha unido mediante NFC!`,
          profileName,
          groupId,
          timestamp: new Date().toISOString()
        });
        console.log(`📡 Peer joined via NFC in group ${groupId}: ${profileName}`);
      }
    });

    // Live Collaborative Bill Splitting (Comanda Viva)
    const handleToggleAssignment = (data) => {
      const groupId = sanitizeGroupId(data?.groupId || data?.group_id);
      if (!groupId) return;

      const sessionId = data?.sessionId || data?.id;
      const itemId = data?.itemId;
      const profileId = data?.profileId;
      const profileName = data?.profileName || 'Un integrante';
      const itemName = data?.itemName;
      const selected = data?.selected !== false;
      const incomingAssignments = data?.assignments;

      // Locate active bill session
      const query = sessionId
        ? "SELECT * FROM active_bill_sessions WHERE id = ? AND status = 'active'"
        : "SELECT * FROM active_bill_sessions WHERE group_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1";
      const params = sessionId ? [sessionId] : [groupId];

      db.get(query, params, (err, row) => {
        let currentAssignments = {};
        if (row && row.assignments) {
          try {
            currentAssignments = JSON.parse(row.assignments);
          } catch (e) {
            currentAssignments = {};
          }
        }

        if (incomingAssignments && typeof incomingAssignments === 'object') {
          currentAssignments = { ...currentAssignments, ...incomingAssignments };
        } else if (itemId && profileId) {
          const curList = currentAssignments[itemId] || [];
          const updatedList = selected
            ? (curList.includes(profileId) ? curList : [...curList, profileId])
            : curList.filter(id => id !== profileId);
          currentAssignments[itemId] = updatedList;
        }

        // Persist in active_bill_sessions in SQLite
        if (row) {
          db.run(
            "UPDATE active_bill_sessions SET assignments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [JSON.stringify(currentAssignments), row.id],
            (uErr) => {
              if (uErr) console.warn('Warning updating active_bill_sessions assignments:', uErr.message);
            }
          );
        }

        const updatePayload = {
          groupId,
          group_id: groupId,
          sessionId: row?.id || sessionId,
          itemId,
          itemName,
          profileId,
          profileName,
          selected,
          assignments: currentAssignments,
          initialClaims: currentAssignments,
          timestamp: new Date().toISOString()
        };

        // Broadcast real-time update to all clients in the room (both cellphones)
        io.to(groupId).emit('bill_assignments_updated', updatePayload);
        io.to(groupId).emit('bill_item_claimed', updatePayload);
        console.log(`🍽️ [LIVE BILL] ${profileName} (${profileId}) ${selected ? 'claimed' : 'unclaimed'} item ${itemId} in group ${groupId}`);
      });
    };

    socket.on('toggle_bill_item', handleToggleAssignment);
    socket.on('toggle_item_assignment', handleToggleAssignment);
    socket.on('bill_item_claimed', handleToggleAssignment);
    socket.on('update_bill_assignments', handleToggleAssignment);

    socket.on('start_bill_session', (data) => {
      const groupId = sanitizeGroupId(data?.groupId || data?.group_id);
      if (groupId) {
        io.to(groupId).emit('bill_session_started', data);
        console.log(`🧾 Live bill session broadcast in group ${groupId}`);
      }
    });

    socket.on('bill_session_started', (data) => {
      const groupId = sanitizeGroupId(data?.groupId || data?.group_id);
      if (groupId) {
        io.to(groupId).emit('bill_session_started', data);
        console.log(`🧾 Live bill session broadcast in group ${groupId}`);
      }
    });

    socket.on('bill_session_closed', (data) => {
      const groupId = sanitizeGroupId(data?.groupId || data?.group_id);
      if (groupId) {
        db.run("UPDATE active_bill_sessions SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND status = 'active'", [groupId], () => {});
        io.to(groupId).emit('bill_session_closed', data);
        console.log(`🏁 Live bill session closed in group ${groupId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
}

module.exports = setupSocketHandler;
