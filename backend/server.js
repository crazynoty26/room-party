const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");
const db = require("./database");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 10000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const MAX_SEATS = 8;
const rooms = new Map();
const savedRooms = db.prepare("SELECT code, password, locked, host_player_id FROM rooms").all();
for (const savedRoom of savedRooms) {
  rooms.set(savedRoom.code, {
    hostId: null,
    hostPlayerId: savedRoom.host_player_id,
    password: savedRoom.password || "",
    locked: Boolean(savedRoom.locked),
    members: new Map(),
    bannedPlayers: new Set()
  });
}
console.log("Restored rooms from database:", rooms.size);
const savedMembers = db.prepare("SELECT room_code, player_id, name, seat, is_admin, activity_status FROM room_members").all();
for (const member of savedMembers) {
  const room = rooms.get(member.room_code);
  if (!room) continue;
  room.members.set("db:" + member.player_id, {
    id: "db:" + member.player_id,
    name: member.name,
    playerId: member.player_id,
    seat: member.seat,
    activityStatus: "offline",
    isAdmin: Boolean(member.is_admin)
  });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/voice-config", (req, res) => {
  const username = process.env.TURN_USERNAME || "";
  const credential = process.env.TURN_PASSWORD || "";

  res.json({
    iceServers: [
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:global.relay.metered.ca:80", username, credential },
      { urls: "turn:global.relay.metered.ca:80?transport=tcp", username, credential },
      { urls: "turn:global.relay.metered.ca:443", username, credential },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username, credential }
    ]
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});
function createRoomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function getMembers(room) {
  return Array.from(room.members.values()).map((member) => ({
    id: member.id,
    name: member.name,
    playerId: member.playerId,

    seat: member.seat,
    isHost: member.id === room.hostId,
    activityStatus: member.activityStatus,
    isAdmin: member.isAdmin === true
  }));
}

function sendRoomUpdate(code) {
  const room = rooms.get(code);

  if (!room) {
    return;
  }

  io.to(code).emit("room-update", {
    code,
    hostId: room.hostId,
    locked: room.locked,
    members: getMembers(room),
    maxSeats: MAX_SEATS
  });
}

function sendError(socket, message) {
  socket.emit("room-error", message);
}

function getFreeSeat(room) {
  const usedSeats = new Set();

  for (const member of room.members.values()) {
    usedSeats.add(member.seat);
  }

  for (let seat = 1; seat <= MAX_SEATS; seat++) {
    if (!usedSeats.has(seat)) {
      return seat;
    }
  }

  return null;
}

function leaveRoom(socket, announce = true) {
  const code = socket.currentRoom;
  if (!code) return;

  const room = rooms.get(code);
  if (!room) {
    socket.currentRoom = null;
    return;
  }

  const member = room.members.get(socket.id);
  if (!member) {
    socket.currentRoom = null;
    return;
  }

  member.activityStatus = "offline";

  db.prepare(
    "UPDATE room_members SET activity_status = 'offline', updated_at = CURRENT_TIMESTAMP WHERE room_code = ? AND player_id = ?"
  ).run(code, member.playerId);

  socket.leave(code);
  socket.currentRoom = null;

  if (announce) {
    io.to(code).emit("system-message", {
      text: `${member.name} left the room.`
    });
  }

  sendRoomUpdate(code);
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create-room", (data = {}) => {
  if (socket.currentRoom) {
    leaveRoom(socket, false);
  }

  const name = String(data.name || "Player").trim() || "Player";
  const password = String(data.password || "").trim();
  const playerId = String(data.playerId || "");

  const code = createRoomCode();

  const room = {
    hostId: socket.id,
    password,
    locked: false,
    members: new Map(),
    bannedPlayers: new Set()
  };

  room.members.set(socket.id, {
    id: socket.id,
    name,
    playerId: playerId,
    seat: 1,
    activityStatus: "online"
  });

  rooms.set(code, room);
  db.prepare("INSERT INTO rooms (code, password, locked, host_player_id) VALUES (?, ?, ?, ?)").run(code, password, 0, playerId);
  db.prepare("INSERT INTO room_members (room_code, player_id, name, seat, is_admin, activity_status) VALUES (?, ?, ?, ?, ?, ?)").run(code, playerId, name, 1, 1, "online");

  socket.playerName = name;
  socket.currentRoom = code;
  socket.join(code);

  socket.emit("room-created", {
    code,
    hostId: socket.id,
    locked: false,
    members: getMembers(room),
    maxSeats: MAX_SEATS
  });

  sendRoomUpdate(code);

  console.log(`${name} created room ${code}`);
});

socket.on("join-room", (data = {}) => {
  const code = String(data.code || "").trim().toUpperCase();
  const name = String(data.name || "Player").trim() || "Player";
  const password = String(data.password || "").trim();
  const playerId = String(data.playerId || "");

    const room = rooms.get(code);
    if (!room) {
      sendError(socket, "Room not found.");
      return;
    }
  if (room.locked) {
    sendError(socket, "Room is locked.");
    return;
  }

  if (room.password && room.password !== password) {
    sendError(socket, "Wrong room password/PIN.");
    return;
  }

  if (room.members.size >= MAX_SEATS) {
    sendError(socket, "Room is full.");
    return;
  }

  if (socket.currentRoom && socket.currentRoom !== code) {
    leaveRoom(socket, false);
  }

  const seat = getFreeSeat(room);

  if (!seat) {
    sendError(socket, "No empty seat available.");
    return;
  }

  room.members.set(socket.id, {
    id: socket.id,
    name,
    playerId: playerId,
    seat,
    activityStatus: "online"
  });

    db.prepare("INSERT OR REPLACE INTO room_members (room_code, player_id, name, seat, is_admin, activity_status) VALUES (?, ?, ?, ?, ?, ?)").run(code, playerId, name, seat, 0, "online");
  socket.playerName = name;
  socket.currentRoom = code;
  socket.join(code);

  socket.emit("room-joined", {
    code,
    hostId: room.hostId,
    locked: room.locked,
    members: getMembers(room),
    maxSeats: MAX_SEATS
  });

  io.to(code).emit("system-message", {
    text: `${name} joined the room.`
  });

  sendRoomUpdate(code);

  console.log(`${name} joined room ${code}`);
});

socket.on("toggle-room-lock", () => {
    const code = socket.currentRoom;
    const room = rooms.get(code);

    if (!room) {
      return;
    }

    if (room.hostId !== socket.id) {
      sendError(socket, "Only the host can lock or unlock the room.");
      return;
    }

    room.locked = !room.locked;

    io.to(code).emit("system-message", {
      text: room.locked ? "Room locked." : "Room unlocked."
    });

    sendRoomUpdate(code);
  });

  socket.on("chat-message", (data = {}) => {
    const code = socket.currentRoom;
    const room = rooms.get(code);

    if (!room) {
      return;
    }

    const member = room.members.get(socket.id);

    if (!member) {
      return;
    }

    const message = String(data.message || "").trim();

    if (!message) {
      return;
    }

    if (message.length > 500) {
      sendError(socket, "Message is too long.");
      return;
    }

    io.to(code).emit("chat-message", {
      id: socket.id,
      name: member.name,
    playerId: playerId,

      message,
      time: Date.now()
    });
  });

  socket.on("set-activity-status", (data = {}) => {
    const code = socket.currentRoom;
    const room = rooms.get(code);

    if (!room) {
      return;
    }

    const member = room.members.get(socket.id);

    if (!member) {
      return;
    }

    const allowed = ["online", "away"];

    if (allowed.includes(data.status)) {
      member.activityStatus = data.status;
      sendRoomUpdate(code);
    }
  });

  socket.on("set-admin", (data = {}) => {
  const code = socket.currentRoom;
  const room = rooms.get(code);

  if (!room) {
    return;
  }

  if (room.hostId !== socket.id) {
    sendError(socket, "Only the host can manage admins.");
    return;
  }

  const targetId = String(data.memberId || "");
  const makeAdmin = data.isAdmin === true;

  if (!targetId || targetId === socket.id) {
    return;
  }

  const target = room.members.get(targetId);

  if (!target) {
    return;
  }

  if (target.id === room.hostId) {
    sendError(socket, "The host is always the owner.");
    return;
  }

  target.isAdmin = makeAdmin;

  io.to(code).emit("system-message", {
    text: makeAdmin
      ? `${target.name} is now an admin.`
      : `${target.name} is no longer an admin.`
  });

  sendRoomUpdate(code);
});

socket.on("remove-member", (data = {}) => {
  const code = socket.currentRoom;
  const room = rooms.get(code);

  if (!room) {
    return;
  }

  const actor = room.members.get(socket.id);

  if (!actor) {
    return;
  }

  const targetId = String(data.memberId || "");

  if (!targetId || targetId === socket.id) {
    return;
  }

  const target = room.members.get(targetId);

  if (!target) {
    return;
  }

  const actorIsHost = room.hostId === socket.id;
  const actorIsAdmin = actor.isAdmin === true;
  const targetIsHost = room.hostId === targetId;
  const targetIsAdmin = target.isAdmin === true;

  if (!actorIsHost && !actorIsAdmin) {
    sendError(socket, "Only the host or an admin can remove members.");
    return;
  }

  if (targetIsHost) {
    sendError(socket, "The host cannot be removed.");
    return;
  }

  if (targetIsAdmin && !actorIsHost) {
    sendError(socket, "Admins cannot remove another admin.");
    return;
  }

  const targetSocket = io.sockets.sockets.get(targetId);

  room.members.delete(targetId);

  if (targetSocket) {
    targetSocket.leave(code);
    targetSocket.currentRoom = null;
    targetSocket.emit("removed-from-room");
  }

  io.to(code).emit("system-message", {
    text: `${target.name} was removed from the room.`
  });

  sendRoomUpdate(code);
});

socket.on("leave-room", () => {
    leaveRoom(socket, true);
  });

  socket.on("mute-member", (data = {}) => {
  const code = socket.currentRoom;
  const room = rooms.get(code);

  if (!room) {
    return;
  }

  const actor = room.members.get(socket.id);

  if (!actor) {
    return;
  }

  const targetId = String(data.memberId || "");

  if (!targetId || targetId === socket.id) {
    return;
  }

  const target = room.members.get(targetId);

  if (!target) {
    return;
  }

  const actorIsHost = room.hostId === socket.id;
  const actorIsAdmin = actor.isAdmin === true;
  const targetIsHost = room.hostId === targetId;
  const targetIsAdmin = target.isAdmin === true;

  if (!actorIsHost && !actorIsAdmin) {
    sendError(socket, "Only the host or an admin can mute members.");
    return;
  }

  if (targetIsHost) {
    sendError(socket, "The host cannot be muted.");
    return;
  }

  if (targetIsAdmin && !actorIsHost) {
    sendError(socket, "Admins cannot mute another admin.");
    return;
  }

  target.serverMuted = true;

  io.to(targetId).emit("admin-muted", {
    by: socket.id
  });

  io.to(code).emit("system-message", {
    text: `${target.name} was muted by ${actor.name}.`
  });
});

socket.on("voice-join", () => {
    const code = socket.currentRoom;

    if (!code || !rooms.has(code)) {
      return;
    }

    socket.to(code).emit("voice-user-joined", {
      socketId: socket.id
    });
  });

  socket.on("voice-offer", (data = {}) => {
    if (!socket.currentRoom || !data.targetId || !data.offer) {
      return;
    }

    io.to(data.targetId).emit("voice-offer", {
      fromId: socket.id,
      offer: data.offer
    });
  });

  socket.on("voice-answer", (data = {}) => {
    if (!socket.currentRoom || !data.targetId || !data.answer) {
      return;
    }

    io.to(data.targetId).emit("voice-answer", {
      fromId: socket.id,
      answer: data.answer
    });
  });

  socket.on("voice-ice-candidate", (data = {}) => {
    if (!socket.currentRoom || !data.targetId || !data.candidate) {
      return;
    }

    io.to(data.targetId).emit("voice-ice-candidate", {
      fromId: socket.id,
      candidate: data.candidate
    });
  });

  socket.on("voice-leave", () => {
    if (!socket.currentRoom) {
      return;
    }

    socket.to(socket.currentRoom).emit("voice-user-left", {
      socketId: socket.id
    });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    leaveRoom(socket, true);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Room Party server running on port ${PORT}`);
});
