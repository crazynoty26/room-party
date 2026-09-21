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

const voicePeers = new Map();
let voiceStream = null;
let serverMuted = false;
let voiceJoined = false;

const voiceConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

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
        ? " 👑 HOST"
        : "";

    const adminText =
      member.isAdmin === true
        ? " 🛡️ ADMIN"
        : "";

    const statusText =
      member.activityStatus === "away"
        ? " • Away"
        : " • Online";

    name.textContent =
      member.name + hostText + adminText + statusText;

    row.appendChild(name);

    const isHost = currentHostId === socket.id;
    const currentMemberIsAdmin =
      currentMembers.find((m) => m.id === socket.id)?.isAdmin === true;

    const targetIsHost = member.id === currentHostId;
    const targetIsAdmin = member.isAdmin === true;

    // Host controls
    if (isHost && !targetIsHost) {
      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "6px";
      controls.style.flexWrap = "wrap";

      const adminBtn = document.createElement("button");

      adminBtn.textContent = targetIsAdmin
        ? "Remove Admin"
        : "Make Admin";

      adminBtn.style.width = "auto";
      adminBtn.style.minHeight = "40px";
      adminBtn.style.marginTop = "0";
      adminBtn.style.padding = "8px 12px";

      adminBtn.addEventListener("click", () => {
        socket.emit("set-admin", {
          memberId: member.id,
          isAdmin: !targetIsAdmin
        });
      });

      controls.appendChild(adminBtn);

      const muteBtnMember = document.createElement("button");

      muteBtnMember.textContent = "Mute";
      muteBtnMember.style.width = "auto";
      muteBtnMember.style.minHeight = "40px";
      muteBtnMember.style.marginTop = "0";
      muteBtnMember.style.padding = "8px 12px";

      muteBtnMember.addEventListener("click", () => {
        socket.emit("mute-member", {
          memberId: member.id
        });
      });

      controls.appendChild(muteBtnMember);

      if (!targetIsAdmin) {
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

        controls.appendChild(removeBtn);
      }

      row.appendChild(controls);
    }

    // Admin controls: normal members only.
    if (
      !isHost &&
      currentMemberIsAdmin &&
      !targetIsHost &&
      !targetIsAdmin &&
      member.id !== socket.id
    ) {
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

      const muteBtnMember = document.createElement("button");

      muteBtnMember.textContent = "Mute";
      muteBtnMember.style.width = "auto";
      muteBtnMember.style.minHeight = "40px";
      muteBtnMember.style.marginTop = "0";
      muteBtnMember.style.padding = "8px 12px";

      muteBtnMember.addEventListener("click", () => {
        socket.emit("mute-member", {
          memberId: member.id
        });
      });

      row.appendChild(removeBtn);
      row.appendChild(muteBtnMember);
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

  stopVoice();
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

async function createVoicePeer(targetId, makeOffer = false) {
  if (!voiceStream || voicePeers.has(targetId)) {
    return;
  }

  const peer = new RTCPeerConnection(voiceConfig);

  voicePeers.set(targetId, peer);

  voiceStream.getTracks().forEach((track) => {
    peer.addTrack(track, voiceStream);
  });

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("voice-ice-candidate", {
        targetId,
        candidate: event.candidate
      });
    }
  };

  peer.ontrack = (event) => {
    let audio = document.getElementById("voice-" + targetId);

    if (!audio) {
      audio = document.createElement("audio");
      audio.id = "voice-" + targetId;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.style.display = "none";
      document.body.appendChild(audio);
    }

    audio.srcObject = event.streams[0];
    audio.play().catch(() => {});
  };

  peer.onconnectionstatechange = () => {
    if (
      peer.connectionState === "failed" ||
      peer.connectionState === "closed"
    ) {
      cleanupVoicePeer(targetId);
    }
  };

  if (makeOffer) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("voice-offer", {
      targetId,
      offer: peer.localDescription
    });
  }
}

async function getOrCreateVoicePeer(targetId) {
  if (voicePeers.has(targetId)) {
    return voicePeers.get(targetId);
  }

  await createVoicePeer(targetId, false);

  return voicePeers.get(targetId);
}

function cleanupVoicePeer(targetId) {
  const peer = voicePeers.get(targetId);

  if (peer) {
    peer.close();
    voicePeers.delete(targetId);
  }

  const audio = document.getElementById("voice-" + targetId);

  if (audio) {
    audio.srcObject = null;
    audio.remove();
  }
}

function cleanupAllVoicePeers() {
  for (const targetId of voicePeers.keys()) {
    cleanupVoicePeer(targetId);
  }
}

voiceBtn.addEventListener("click", async () => {
  if (!joinedRoom) {
    setStatus("Join a room first.");
    return;
  }

  if (voiceJoined) {
    voiceJoined = false;

    socket.emit("voice-leave");

    serverMuted = false;

    cleanupAllVoicePeers();

    if (voiceStream) {
      voiceStream.getTracks().forEach((track) => track.stop());
      voiceStream = null;
    }

    voiceBtn.textContent = "Join Voice";
    muteBtn.classList.add("hidden");
    voiceStatus.textContent = "Voice not connected";

    setStatus("Left voice.");
    return;
  }

  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    voiceJoined = true;

    voiceBtn.textContent = "Leave Voice";
    muteBtn.classList.remove("hidden");
    muteBtn.textContent = "Mute";
    voiceStatus.textContent = "Voice connected";

    socket.emit("voice-join");

    setStatus("Microphone connected.");
  } catch (error) {
    voiceStream = null;
    voiceJoined = false;

    voiceStatus.textContent = "Microphone permission denied";
    setStatus("Please allow microphone access.");
  }
});

socket.on("admin-muted", () => {
  serverMuted = true;

  if (voiceStream) {
    voiceStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
  }

  muteBtn.textContent = "Unmute";
  voiceStatus.textContent = "Muted by admin";
});

muteBtn.addEventListener("click", () => {
  if (!voiceStream) {
    return;
  }

  if (serverMuted) {
    voiceStatus.textContent = "Muted by admin";
    return;
  }

  const audioTracks = voiceStream.getAudioTracks();

  if (!audioTracks.length) {
    return;
  }

  const enabled = audioTracks[0].enabled;

  audioTracks.forEach((track) => {
    track.enabled = !enabled;
  });

  muteBtn.textContent = enabled ? "Unmute" : "Mute";
  voiceStatus.textContent = enabled
    ? "Voice muted"
    : "Voice connected";
});

socket.on("voice-user-joined", async (data) => {
  if (!voiceJoined || !data || !data.socketId) {
    return;
  }

  try {
    await createVoicePeer(data.socketId, true);
  } catch (error) {
    console.error("Voice offer error:", error);
  }
});

socket.on("voice-offer", async (data) => {
  if (!voiceJoined || !data || !data.fromId || !data.offer) {
    return;
  }

  try {
    const peer = await getOrCreateVoicePeer(data.fromId);

    await peer.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socket.emit("voice-answer", {
      targetId: data.fromId,
      answer: peer.localDescription
    });
  } catch (error) {
    console.error("Voice answer error:", error);
  }
});

socket.on("voice-answer", async (data) => {
  if (!data || !data.fromId || !data.answer) {
    return;
  }

  const peer = voicePeers.get(data.fromId);

  if (!peer) {
    return;
  }

  try {
    await peer.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  } catch (error) {
    console.error("Voice remote answer error:", error);
  }
});

socket.on("voice-ice-candidate", async (data) => {
  if (!data || !data.fromId || !data.candidate) {
    return;
  }

  const peer = voicePeers.get(data.fromId);

  if (!peer) {
    return;
  }

  try {
    await peer.addIceCandidate(
      new RTCIceCandidate(data.candidate)
    );
  } catch (error) {
    console.error("Voice ICE error:", error);
  }
});

socket.on("voice-user-left", (data) => {
  if (!data || !data.socketId) {
    return;
  }

  cleanupVoicePeer(data.socketId);
});

socket.on("removed-from-room", () => {
  voiceJoined = false;

  cleanupAllVoicePeers();

  if (voiceStream) {
    voiceStream.getTracks().forEach((track) => track.stop());
    voiceStream = null;
  }

  voiceBtn.textContent = "Join Voice";
  muteBtn.classList.add("hidden");
  voiceStatus.textContent = "Voice not connected";

  joinedRoom = false;
  currentRoomCode = "";
  currentMembers = [];

  showHome();
  setStatus("You were removed from the room.");
});

socket.on("connect", () => {
  setStatus("Connected");
});

function stopVoice() {
  if (voiceJoined) {
    socket.emit("voice-leave");
  }

  serverMuted = false;

  voiceJoined = false;
  cleanupAllVoicePeers();

  if (voiceStream) {
    voiceStream.getTracks().forEach((track) => track.stop());
    voiceStream = null;
  }

  voiceBtn.textContent = "Join Voice";
  muteBtn.classList.add("hidden");
  voiceStatus.textContent = "Voice not connected";
}

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

