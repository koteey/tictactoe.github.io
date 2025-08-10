const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Хранение комнат
const rooms = new Map();

function generateRoomId() {
  let id;
  do {
    id = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(id));
  return id;
}

app.use(express.static(path.join(__dirname)));

io.on('connection', (socket) => {
  console.log('Подключился:', socket.id);
  let currentRoom = null;

  socket.on('createRoom', () => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      players: [socket.id],
      board: Array(9).fill(''),
      turn: 'X',
      gameActive: true,
      scores: { X: 0, O: 0 },
      lastWinner: null
    });
    socket.join(roomId);
    currentRoom = roomId;
    socket.emit('roomCreated', roomId);
    socket.emit('joined', 'X');
  });

  socket.on('joinRoom', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Комната не найдена.');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', 'Комната заполнена.');
      return;
    }

    socket.join(roomId);
    currentRoom = roomId;
    room.players.push(socket.id);
    socket.emit('joined', 'O');
    io.to(roomId).emit('playerJoined');
  });

  socket.on('move', (roomId, index) => {
    const room = rooms.get(roomId);
    if (!room || !room.gameActive || room.board[index] !== '' || 
        (room.turn === 'X' && room.players[0] !== socket.id) || 
        (room.turn === 'O' && room.players[1] !== socket.id)) return;

    room.board[index] = room.turn;
    io.to(roomId).emit('move', index, room.turn);

    const winPattern = checkWin(room.board);
    if (winPattern) {
      room.scores[room.turn]++;
      room.gameActive = false;
      room.lastWinner = room.turn;
      io.to(roomId).emit('gameOver', { winner: room.turn, winPattern, scores: room.scores });
      return;
    }

    if (room.board.every(cell => cell !== '')) {
      room.gameActive = false;
      room.lastWinner = null;
      io.to(roomId).emit('gameOver', { winner: null, scores: room.scores });
      return;
    }

    room.turn = room.turn === 'X' ? 'O' : 'X';
  });

  socket.on('resetGame', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.board = Array(9).fill('');
    const firstPlayer = room.lastWinner === 'X' ? 'O' : (room.lastWinner === 'O' ? 'X' : 'X');
    room.turn = firstPlayer;
    room.gameActive = true;
    io.to(roomId).emit('resetGame');
  });

  socket.on('leaveRoom', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      room.players = room.players.filter(id => id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('opponentDisconnected');
        room.scores = { X: 0, O: 0 };
      }
    }
    socket.leave(roomId);
    currentRoom = null;
  });

  socket.on('disconnect', () => {
    for (let [roomId, room] of rooms) {
      if (room.players.includes(socket.id)) {
        room.players = room.players.filter(id => id !== socket.id);
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('opponentDisconnected');
          room.scores = { X: 0, O: 0 };
        }
      }
    }
    currentRoom = null;
    console.log('Отключился:', socket.id);
  });
});

function checkWin(board) {
  const patterns = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (let p of patterns) {
    const [a,b,c] = p;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return p;
  }
  return false;
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});