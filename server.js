const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
  board: Array(5).fill().map(() => Array(5).fill(null)),
  currentPlayer: 'A',
  players: {},
  moveHistory: []
};

const pieces = {
  'P': { name: 'Pawn', moves: ['F', 'B', 'L', 'R', 'FL', 'FR', 'BL', 'BR'], range: 1 },
  'H1': { name: 'Hero1', moves: ['F', 'B', 'L', 'R'], range: 2 },
  'H2': { name: 'Hero2', moves: ['FL', 'FR', 'BL', 'BR'], range: 2 },
  'H3': { name: 'Hero3', moves: ['F', 'B', 'L', 'R', 'FL', 'FR', 'BL', 'BR'], range: 3 }
};



function initializeGame() {
  gameState.board = [
    ['A-P1', 'A-H1', 'A-H2', 'A-H3', 'A-P2'],
    [null, null, null, null, null],
    [null, null, null, null, null],
    [null, null, null, null, null],
    ['B-P1', 'B-H1', 'B-H2', 'B-H3', 'B-P2']
  ];
  gameState.currentPlayer = 'A';
  gameState.moveHistory = [];
}

function isValidMove(player, fromX, fromY, toX, toY) {
  const piece = gameState.board[fromY][fromX];
  if (!piece || piece[0] !== player) return false;

  const [, type] = piece.split('-');
  const pieceType = pieces[type];

  if (!pieceType) return false;

  const dx = toX - fromX;
  const dy = toY - fromY;

  // Check if the move is within the board bounds
  if (toX < 0 || toX > 4 || toY < 0 || toY > 4) return false;

  // Check if the target position is occupied by the player's own piece
  if (gameState.board[toY][toX] && gameState.board[toY][toX][0] === player) return false;

  // Pawn (P) moves exactly 1 step in any direction
  if (type.startsWith('P')) {
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      return true;
    }
  }

  // Hero1 (H1) moves up to 2 steps in any straight direction
  if (type.startsWith('H1')) {
    const isStraightMove = (Math.abs(dx) <= 2 && dy === 0) || (Math.abs(dy) <= 2 && dx === 0);
    if (isStraightMove) return true;
  }

  // Hero2 (H2) moves up to 2 steps diagonally
  if (type.startsWith('H2')) {
    const isDiagonalMove = Math.abs(dx) === Math.abs(dy) && Math.abs(dx) <= 2;
    if (isDiagonalMove) return true;
  }

  // Hero3 (H3) moves up to 3 steps in any direction
  if (type.startsWith('H3')) {
    const isStraightMove = (Math.abs(dx) <= 3 && dy === 0) || (Math.abs(dy) <= 3 && dx === 0);
    const isDiagonalMove = Math.abs(dx) === Math.abs(dy) && Math.abs(dx) <= 3;
    if (isStraightMove || isDiagonalMove) return true;
  }

  return false;
}

function processMove(player, fromX, fromY, toX, toY) {
  const piece = gameState.board[fromY][fromX];
  const capturedPiece = gameState.board[toY][toX];

  // Implement capturing logic for Hero1, Hero2, and Hero3
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let i = 1; i <= steps; i++) {
    const intermediateX = fromX + i * Math.sign(toX - fromX);
    const intermediateY = fromY + i * Math.sign(toY - fromY);
    const target = gameState.board[intermediateY][intermediateX];
    if (target && target[0] !== player) {
      gameState.board[intermediateY][intermediateX] = null; // Capture the piece
    }
  }

  gameState.board[toY][toX] = piece;
  gameState.board[fromY][fromX] = null;

  const moveDescription = `${piece}: (${fromX},${fromY}) to (${toX},${toY})${capturedPiece ? ` capturing ${capturedPiece}` : ''}`;
  gameState.moveHistory.push(moveDescription);

  gameState.currentPlayer = gameState.currentPlayer === 'A' ? 'B' : 'A';
  return true;
}


function checkGameOver() {
  const aHeroes = gameState.board.flat().filter(cell => cell && cell.startsWith('A-H')).length;
  const bHeroes = gameState.board.flat().filter(cell => cell && cell.startsWith('B-H')).length;
  if (aHeroes === 0) return 'B';
  if (bHeroes === 0) return 'A';
  if (gameState.moveHistory.length >= 100) return 'draw';
  return null;
}

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('joinGame', (player) => {
    if (!gameState.players[player]) {
      gameState.players[player] = socket.id;
      socket.emit('playerAssigned', player);
      
      if (Object.keys(gameState.players).length === 2) {
        initializeGame();
        io.emit('gameStart', gameState);
      }
    } else {
      socket.emit('gameUpdate', gameState);
    }
  });
  
  socket.on('move', ({ player, fromX, fromY, toX, toY }) => {
    if (player === gameState.currentPlayer && isValidMove(player, fromX, fromY, toX, toY)) {
      processMove(player, fromX, fromY, toX, toY);
      io.emit('gameUpdate', gameState);
      
      const result = checkGameOver();
      if (result) {
        io.emit('gameOver', { result });
      }
    } else {
      socket.emit('invalidMove');
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
    Object.keys(gameState.players).forEach(player => {
      if (gameState.players[player] === socket.id) {
        delete gameState.players[player];
      }
    });
    if (Object.keys(gameState.players).length < 2) {
      gameState = {
        board: Array(5).fill().map(() => Array(5).fill(null)),
        currentPlayer: 'A',
        players: {},
        moveHistory: []
      };
      io.emit('gameReset');
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
