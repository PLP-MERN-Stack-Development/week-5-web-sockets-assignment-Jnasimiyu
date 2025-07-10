// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Initialize app and server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ✅ Single upload route
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// In-memory store
const users = {};
const messages = [];
const typingUsers = {};

// ✅ Socket.io logic
io.on('connection', (socket) => {
  socket.on('user_join', ({ username, room }) => {
    users[socket.id] = { username, room, id: socket.id };
    socket.join(room);

    const roomUsers = Object.values(users).filter(u => u.room === room);
    io.to(room).emit('user_list', roomUsers);
    io.to(room).emit('user_joined', { username, id: socket.id });
  });

  socket.on('send_message', (data) => {
    const user = users[socket.id];
    if (!user) return;

    const msg = {
      id: Date.now(),
      sender: user.username,
      senderId: socket.id,
      room: user.room,
      timestamp: new Date().toISOString(),
      text: data.text || '',
      image: data.image || '',
      reactions: {},
      seenBy: [user.username],
    };
    messages.push(msg);
    if (messages.length > 200) messages.shift();

    io.to(user.room).emit('receive_message', msg);
  });

  socket.on('private_message', ({ to, message, image }) => {
    const sender = users[socket.id];
    const msg = {
      id: Date.now(),
      sender: sender?.username || 'Anonymous',
      senderId: socket.id,
      message,
      image,
      isPrivate: true,
      timestamp: new Date().toISOString(),
    };
    socket.to(to).emit('private_message', msg);
    socket.emit('private_message', msg);
  });

  socket.on('typing', (isTyping) => {
    const user = users[socket.id];
    if (!user) return;

    if (isTyping) {
      typingUsers[socket.id] = user.username;
    } else {
      delete typingUsers[socket.id];
    }

    const roomTyping = Object.entries(typingUsers)
      .filter(([id]) => users[id]?.room === user.room)
      .map(([_, name]) => name);

    io.to(user.room).emit('typing_users', roomTyping);
  });

  socket.on('message_reaction', ({ messageId, emoji }) => {
    const msg = messages.find((m) => m.id === messageId);
    if (msg) {
      msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
      io.to(msg.room).emit('receive_message', msg);
    }
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      delete users[socket.id];
      delete typingUsers[socket.id];

      const roomUsers = Object.values(users).filter(u => u.room === user.room);
      io.to(user.room).emit('user_list', roomUsers);
      io.to(user.room).emit('user_left', { username: user.username });
    }
  });
    socket.on('message_seen', (messageId) => {
  const user = users[socket.id];
  const msg = messages.find((m) => m.id === messageId);
  if (user && msg && !msg.seenBy.includes(user.username)) {
    msg.seenBy.push(user.username);
    io.to(msg.room).emit('message_seen_update', { messageId, seenBy: msg.seenBy });
  }
});

});

// API routes
app.get('/api/messages', (req, res) => {
  const { room } = req.query;
  const filtered = room ? messages.filter((m) => m.room === room) : messages;
  res.json(filtered);
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(users));
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

module.exports = { app, server, io };
