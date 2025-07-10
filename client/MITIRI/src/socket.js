import { io } from "socket.io-client";

// Use the correct backend URL and port
const socket = io("http://localhost:5000");

export default socket;
