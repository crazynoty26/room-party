const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

const rooms = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
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
    isHost: member.id === room.hostId
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
    members: getMembers(room)
  });
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("create-room", (data = {}) => {
    const name = String(data.name || "Player").trim() || "Player";
    const password = String(data.password || "");

    const code = createRoomCode();

    const room = {
      hostId: socket.id,
      password,
      locked: false,
      members: new Map()
    };

    room.members.set(socket.id, {
      id: socket.id,
      name
    });

    rooms.set(code, room);

    socket.playerName = name;
    socket.currentRoom = code;
    socket.join(code);

    socket.emit("room-created", {
      code,
      hostId: socket.id,
      locked: false,
      members: getMembers(room)
    });

    sendRoomUpdate(code);

    console.log(`${name} created room ${code}`);
  });

  socket.on("join-room", (data = {}) => {
    const code = String(data.code || "").trim().toUpperCase();
    const name = String(data.name || "Player").trim() || "Player";
    const password = String(data.password || "");

    const room = rooms.get(code);

    if (!room) {
      socket.emit("room-error", "Room not found.");
      return;
    }

    if (room.locked) {
      socket.emit("room-error", "Room is locked.");
      return;
    }

    if (room.password && room.password !== password) {
      socket.emit("room-error", "Wrong room password/PIN.");
      return;
    }

    room.members.set(socket.id, {
      id: socket.id,
      name
    });

    socket.playerName = name;
    socket.currentRoom = code;
    socket.join(code);

    socket.emit("room-joined", {
      code,
      hostId: room.hostId,
      locked: room.locked,
      members: getMembers(room)
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
      socket.emit("room-error", "Only the host can lock or unlock the room.");
      return;
    }

    room.locked = !room.locked;

    sendRoomUpdate(code);

    io.to(code).emit("system-message", {
      text: room.locked ? "Room locked." : "Room unlocked."
    });
  });

  socket.on("leave-room", () => {
    leaveRoom(socket);
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    leaveRoom(socket);
  });
});

function leaveRoom(socket) {
  const code = socket.currentRoom;

  if (!code) {
    return;
  }

  const room = rooms.get(code);

  if (!room) {
    socket.currentRoom = null;
    return;
  }

  const member = room.members.get(socket.id);

  room.members.delete(socket.id);
  socket.leave(code);

  if (member) {
    io.to(code).emit("system-message", {
      text: `${member.name} left the room.`
    });
  }

  if (room.hostId === socket.id) {
    const nextMember = room.members.values().next().value;

    if (nextMember) {
      room.hostId = nextMember.id;
      io.to(code).emit("system-message", {
        text: `${nextMember.name} is now the host.`
      });
    }
  }

  if (room.members.size === 0) {
    rooms.delete(code);
  } else {
    sendRoomUpdate(code);
  }

  socket.currentRoom = null;
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Room Party server running on port ${PORT}`);
});
