const socket = io();

const homeScreen = document.getElementById("homeScreen");
const roomScreen = document.getElementById("roomScreen");

const playerName = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomPassword = document.getElementById("roomPassword");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

const roomName = document.getElementById("roomName");
const seatsGrid = document.getElementById("seatsGrid");
const membersList = document.getElementById("membersList");

const copyRoomBtn = document.getElementById("copyRoomBtn");
const shareRoomBtn = document.getElementById("shareRoomBtn");
const lockRoomBtn = document.getElementById("lockRoomBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

const activityStatus = document.getElementById("activityStatus");

const voiceBtn = document.getElementById("voiceBtn");
const muteBtn = document.getElementById("muteBtn");
const voiceStatus = document.getElementById("voiceStatus");

const status = document.getElementById("status");

let currentRoomCode = "";
let currentHostId = "";
let currentLocked = false;
let currentMembers = [];
let joinedRoom = false;

function setStatus(message) {
  status.textContent = message;
}

function showHome() {
  homeScreen.classList.remove("hidden");
  roomScreen.classList.add("hidden");
}

function showRoom() {
  homeScreen.classList.add("hidden");
  roomScreen.classList.remove("hidden");
}

function renderRoom(data) {
  currentRoomCode = data.code || currentRoomCode;
  currentHostId = data.hostId || currentHostId;
  currentLocked = Boolean(data.locked);
  currentMembers = Array.isArray(data.members) ? data.members : [];

  roomName.textContent = currentRoomCode;

  lockRoomBtn.textContent = currentLocked
    ? "Unlock Room"
    : "Lock Room";

  renderSeats();
  renderMembers();
  showRoom();
}

function renderSeats() {
  seatsGrid.innerHTML = "";

  const maxSeats = Math.max(8, currentMembers.length);

  for (let i = 0; i < maxSeats; i++) {
    const member = currentMembers[i];
    const seat = document.createElement("div");

    seat.className = "seat";

    if (!member) {
      seat.classList.add("empty");

      seat.innerHTML = `
        <div class="seat-icon">💺</div>
        <div class="seat-name">Empty Seat</div>
      `;
    } else {
      const hostText =
        member.id === currentHostId
          ? '<div class="host-badge">HOST</div>'
          : "";

      seat.innerHTML = `
        <div class="seat-icon">🧑</div>
        <div class="seat-name"></div>
        ${hostText}
      `;

      seat.querySelector(".seat-name").textContent = member.name;
    }

    seatsGrid.appendChild(seat);
  }
}

function renderMembers() {
  membersList.innerHTML = "";

  currentMembers.forEach((member) => {
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "10px";

    const name = document.createElement("span");

    const hostText =
      member.id === currentHostId
        ? " 👑 Host"
        : "";

    const statusText =
      member.activityStatus === "away"
        ? " 🟡 Away"
        : " 🟢 Online";

    name.textContent = member.name + hostText + statusText;

    row.appendChild(name);

    if (currentHostId === socket.id && member.id !== socket.id) {
      const removeBtn = document.createElement("button");

      removeBtn.textContent = "Remove";
      removeBtn.className = "danger";
      removeBtn.style.width = "auto";
      removeBtn.style.minHeight = "40px";
      removeBtn.style.marginTop = "0";
      removeBtn.style.padding = "8px 12px";

      removeBtn.addEventListener("click", () => {
        socket.emit("remove-member", {
          memberId: member.id
        });
      });

      row.appendChild(removeBtn);
    }

    li.appendChild(row);
    membersList.appendChild(li);
  });
}

function addChatMessage(text, system = false) {
  const message = document.createElement("div");

  message.className = system
    ? "chat-message system-message"
    : "chat-message";

  message.textContent = text;

  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

createRoomBtn.addEventListener("click", () => {
  const name = playerName.value.trim() || "Player";
  const password = roomPassword.value.trim();

  setStatus("Creating room...");

  socket.emit("create-room", {
    name,
    password
  });
});

joinRoomBtn.addEventListener("click", () => {
  const name = playerName.value.trim() || "Player";
  const code = roomCodeInput.value.trim().toUpperCase();
  const password = roomPassword.value.trim();

  if (!code) {
    setStatus("Please enter room code.");
    return;
  }

  setStatus("Joining room...");

  socket.emit("join-room", {
    name,
    code,
    password
  });
});

lockRoomBtn.addEventListener("click", () => {
  if (!joinedRoom) return;

  socket.emit("toggle-room-lock");
});

leaveRoomBtn.addEventListener("click", () => {
  if (!joinedRoom) return;

  socket.emit("leave-room");
});

copyRoomBtn.addEventListener("click", async () => {
  if (!currentRoomCode) return;

  try {
    await navigator.clipboard.writeText(currentRoomCode);
    setStatus("Room code copied.");
  } catch (error) {
    setStatus("Could not copy room code.");
  }
});

shareRoomBtn.addEventListener("click", async () => {
  if (!currentRoomCode) return;

  const shareUrl =
    window.location.origin +
    "/?room=" +
    encodeURIComponent(currentRoomCode);

  try {
    if (navigator.share) {
      await navigator.share({
        title: "Room Party",
        text: "Join my Room Party room.",
        url: shareUrl
      });
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Room link copied.");
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus("Could not share room.");
    }
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = chatInput.value.trim();

  if (!message || !joinedRoom) return;

  socket.emit("chat-message", {
    message
  });

  chatInput.value = "";
});

activityStatus.addEventListener("change", () => {
  if (!joinedRoom) return;

  socket.emit("set-activity-status", {
    status: activityStatus.value
  });
});

voiceBtn.addEventListener("click", () => {
  setStatus("Voice system will be connected in the next step.");
});

muteBtn.addEventListener("click", () => {
  setStatus("Voice system will be connected in the next step.");
});

socket.on("connect", () => {
  setStatus("Connected");
});

socket.on("disconnect", () => {
  setStatus("Connection lost. Reconnecting...");
});

socket.on("room-created", (data) => {
  joinedRoom = true;
  chatMessages.innerHTML = "";

  renderRoom(data);
  setStatus("Room created: " + data.code);
});

socket.on("room-joined", (data) => {
  joinedRoom = true;
  chatMessages.innerHTML = "";

  renderRoom(data);
  setStatus("Joined room: " + data.code);
});

socket.on("room-update", (data) => {
  if (!joinedRoom) return;

  renderRoom(data);
});

socket.on("system-message", (data) => {
  if (data && data.text) {
    addChatMessage(data.text, true);
  }
});

socket.on("chat-message", (data) => {
  if (!data) return;

  if (data.name && data.message) {
    addChatMessage(data.name + ": " + data.message);
  } else if (data.message) {
    addChatMessage(data.message);
  }
});

socket.on("room-error", (message) => {
  setStatus(message);
});

socket.on("connect_error", () => {
  setStatus("Unable to connect to server.");
});

const sharedRoomCode = new URLSearchParams(window.location.search).get("room");

if (sharedRoomCode) {
  roomCodeInput.value = sharedRoomCode.toUpperCase();
  setStatus("Room link detected. Enter your name and join.");
}

