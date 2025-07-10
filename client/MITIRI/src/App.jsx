import { useEffect, useRef, useState } from 'react';
import socket from './socket';

function App() {
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [room, setRoom] = useState('General');
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [privateMessages, setPrivateMessages] = useState([]);
  const fileInputRef = useRef();

  // Load messages on join
  useEffect(() => {
    fetch(`http://localhost:5000/api/messages?room=${room}`)
      .then((res) => res.json())
      .then((data) => setMessages(data));
  }, [room]);

  // Ask for notification permission
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  // Mark messages as seen
  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.room === room && msg.senderId !== socket.id) {
        socket.emit('message_seen', msg.id);
      }
    });
  }, [messages]);

  // Listen to updates
  useEffect(() => {
    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.senderId !== socket.id) {
        playSound();
        showNotification(`💬 New message from ${msg.sender}`, msg.text || 'Sent a file');
      }
    });

    socket.on('user_list', setUsers);
    socket.on('typing_users', setTypingUsers);
    socket.on('private_message', (msg) => setPrivateMessages((prev) => [...prev, msg]));
    socket.on('user_joined', ({ username }) => showNotification('👤 User Joined', `${username} joined`));
    socket.on('user_left', ({ username }) => showNotification('👤 User Left', `${username} left`));

    socket.on('message_seen_update', ({ messageId, seenBy }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, seenBy } : m
        )
      );
    });

    return () => socket.removeAllListeners();
  }, []);

  const joinChat = () => {
    if (username.trim()) {
      socket.emit('user_join', { username, room });
      setJoined(true);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !file) return;

    let imageUrl = '';
    if (file) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('http://localhost:5000/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        imageUrl = data.url;
      } catch (err) {
        console.error('Upload failed', err);
      }
    }

    const messagePayload = {
      text: input,
      image: imageUrl,
    };

    if (selectedUser) {
      socket.emit('private_message', { ...messagePayload, to: selectedUser.id });
    } else {
      socket.emit('send_message', messagePayload);
    }

    setInput('');
    setFile(null);
    fileInputRef.current.value = null;
    socket.emit('typing', false);
  };

  const handleTyping = (e) => {
    setInput(e.target.value);
    socket.emit('typing', e.target.value.length > 0);
  };

  const showNotification = (title, body) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  };

  const playSound = () => {
    const audio = new Audio('/notify.mp3');
    audio.play().catch(() => {});
  };

  const handleReaction = (messageId, emoji) => {
    socket.emit('message_reaction', { messageId, emoji });
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">💬 Mitiri Chat App</h1>

      {!joined ? (
        <div>
          <input
            className="border p-2 w-full mb-3"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={joinChat} className="w-full bg-blue-600 text-white py-2 rounded">
            Join Chat
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="font-semibold">👥 Users</h2>
            <ul>
              {users.map((u) => (
                <li
                  key={u.id}
                  className={`cursor-pointer ${selectedUser?.id === u.id ? 'font-bold' : ''}`}
                  onClick={() => setSelectedUser(u)}
                >
                  {u.username} {u.id === socket.id && '(You)'}
                </li>
              ))}
            </ul>
          </div>

          <div className="border h-64 overflow-y-auto bg-gray-50 p-3 mb-3">
            {messages.map((msg) => (
              <div key={msg.id} className="mb-4">
                <strong>{msg.sender}</strong>: {msg.text}
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="file"
                    className="max-w-xs mt-1 rounded shadow"
                  />
                )}
                <div className="text-xs text-gray-600">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
                {msg.seenBy && msg.seenBy.length > 1 && (
                  <small className="text-xs text-gray-400 block mt-1">
                    Seen by: {msg.seenBy.filter((u) => u !== msg.sender).join(', ')}
                  </small>
                )}
                <div className="text-sm mt-2 space-x-2">
                  <button onClick={() => handleReaction(msg.id, '👍')}>👍</button>
                  <button onClick={() => handleReaction(msg.id, '❤️')}>❤️</button>
                  <button onClick={() => handleReaction(msg.id, '😂')}>😂</button>
                  {msg.reactions &&
                    Object.entries(msg.reactions).map(([emoji, count]) => (
                      <span key={emoji} className="ml-2">
                        {emoji} {count}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {typingUsers.length > 0 && (
            <div className="text-sm italic text-gray-600 mb-2">
              {typingUsers.join(', ')} typing...
            </div>
          )}

          <div className="mb-3">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={(e) => setFile(e.target.files[0])}
              className="mb-2"
            />
            <div className="flex gap-2">
              <input
                value={input}
                onChange={handleTyping}
                className="border p-2 flex-grow"
                placeholder="Type a message..."
              />
              <button onClick={handleSend} className="bg-green-600 text-white px-4 py-2 rounded">
                Send
              </button>
            </div>
          </div>

          {selectedUser && (
            <div className="mt-4">
              <h3 className="font-semibold">🕵️ Private Chat with {selectedUser.username}</h3>
              <div className="border h-40 overflow-y-auto bg-yellow-50 p-2">
                {privateMessages
                  .filter(
                    (m) =>
                      (m.senderId === selectedUser.id || m.senderId === socket.id) && m.isPrivate
                  )
                  .map((m) => (
                    <div key={m.id} className="mb-3">
                      <strong>{m.sender}:</strong> {m.message}
                      {m.image && (
                        <img src={m.image} alt="private" className="max-w-xs mt-1 rounded shadow" />
                      )}
                      <div className="text-xs text-gray-500">
                        {new Date(m.timestamp).toLocaleTimeString()}
                      </div>
                      {m.seenBy && m.seenBy.length > 1 && (
                        <small className="text-xs text-gray-400 block">
                          Seen by: {m.seenBy.filter((u) => u !== m.sender).join(', ')}
                        </small>
                      )}
                      <div className="text-sm mt-1 space-x-2">
                        <button onClick={() => handleReaction(m.id, '👍')}>👍</button>
                        <button onClick={() => handleReaction(m.id, '❤️')}>❤️</button>
                        <button onClick={() => handleReaction(m.id, '😂')}>😂</button>
                        {m.reactions &&
                          Object.entries(m.reactions).map(([emoji, count]) => (
                            <span key={emoji} className="ml-1">
                              {emoji} {count}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
