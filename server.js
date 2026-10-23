const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayers = []; 
let rooms = {}; 

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const choicesList = ['rock', 'paper', 'scissors', 'lizard', 'spock'];

function checkWin(c1, c2) {
    if (c1 === c2) return 'Draw';
    const winsAgainst = {
        'rock': ['scissors', 'lizard'],
        'paper': ['rock', 'spock'],
        'scissors': ['paper', 'lizard'],
        'lizard': ['spock', 'paper'],
        'spock': ['scissors', 'rock']
    };
    if (winsAgainst[c1].includes(c2)) return 'Win';
    return 'Lose';
}

function getRandomChoice() {
    return choicesList[Math.floor(Math.random() * choicesList.length)];
}

const counters = { 'rock': 'paper', 'paper': 'scissors', 'scissors': 'rock', 'lizard': 'rock', 'spock': 'lizard' };

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // --- LOBBY ACTIONS ---
    socket.on('joinRandom', (data) => {
        socket.username = data.name || 'Player';
        socket.avatar = data.avatar || '🤖';
        socket.level = data.level || 1;
        
        if (waitingPlayers.length > 0) {
            const opponent = waitingPlayers.shift();
            const roomId = `room_${opponent.id}_${socket.id}`;
            rooms[roomId] = { p1: opponent, p2: socket, spectators: [] };
            setupGame(rooms[roomId], roomId);
        } else {
            waitingPlayers.push(socket);
            socket.emit('waiting', { msg: 'SEARCHING FOR RANDOM CHALLENGER...' });
        }
    });

    socket.on('joinAI', (data) => {
        socket.username = data.name || 'Player';
        socket.avatar = data.avatar || '🤖';
        socket.level = data.level || 1;
        const roomId = `room_ai_${socket.id}`;
        
        const aiSocket = {
            id: 'MAINFRAME', username: 'MAINFRAME', avatar: '💻', level: 99,
            isAI: true, emit: () => {}, join: () => {}, leave: () => {}
        };
        
        rooms[roomId] = { p1: socket, p2: aiSocket, spectators: [], isAI: true };
        setupGame(rooms[roomId], roomId);
    });

    socket.on('createRoom', (data) => {
        socket.username = data.name || 'Player';
        socket.avatar = data.avatar || '🤖';
        socket.level = data.level || 1;
        const code = generateRoomCode();
        rooms[code] = { p1: socket, p2: null, spectators: [] };
        socket.emit('roomCreated', { code });
        socket.emit('waiting', { msg: `ROOM CREATED. SHARE CODE: ${code}` });
    });

    socket.on('joinRoom', (data) => {
        socket.username = data.name || 'Spectator';
        socket.avatar = data.avatar || '👻';
        socket.level = data.level || 1;
        const code = (data.code || '').toUpperCase();
        const room = rooms[code];
        
        if (room) {
            if (!room.p2) {
                room.p2 = socket;
                setupGame(room, code);
            } else {
                socket.join(code);
                socket.isSpectator = true;
                socket.game = room.game;
                room.spectators.push(socket);
                
                socket.emit('spectatorMode', {
                    p1: room.p1.username, p1Avatar: room.p1.avatar, p1Level: room.p1.level, p1Score: room.game.p1Score,
                    p2: room.p2.username, p2Avatar: room.p2.avatar, p2Level: room.p2.level, p2Score: room.game.p2Score
                });
                io.to(code).emit('chatMessage', { sender: 'System', msg: `${socket.username} is spectating.` });
            }
        } else {
            socket.emit('errorMsg', 'Room not found!');
        }
    });

    // --- GAME SETUP ---
    function setupGame(room, roomId) {
        room.p1.join(roomId);
        room.p2.join(roomId);
        
        const game = {
            roomId, room,
            p1Choice: null, p2Choice: null,
            p1Score: 0, p2Score: 0,
            p1Hacks: 1, p2Hacks: 1, 
            timerId: null,
            history: [] // Cinematic Replay History
        };
        room.game = game; room.p1.game = game; room.p1.playerNum = 1; room.p2.game = game; room.p2.playerNum = 2;

        room.p1.emit('gameStart', { opponent: room.p2.username, oppAvatar: room.p2.avatar, oppLevel: room.p2.level, yourAvatar: room.p1.avatar });
        room.p2.emit('gameStart', { opponent: room.p1.username, oppAvatar: room.p1.avatar, oppLevel: room.p1.level, yourAvatar: room.p2.avatar });
        
        updateScore(game); startRound(game);
    }

    // --- ROUND TIMER ---
    function startRound(game) {
        game.p1Choice = null; game.p2Choice = null;
        
        game.room.p1.emit('hacksUpdate', game.p1Hacks);
        if(!game.room.isAI) game.room.p2.emit('hacksUpdate', game.p2Hacks);

        io.to(game.roomId).emit('roundStart', { duration: 10000 });
        
        game.timerId = setTimeout(() => {
            if (!game.p1Choice) game.p1Choice = getRandomChoice();
            if (!game.p2Choice && !game.room.isAI) game.p2Choice = getRandomChoice();
            if (game.room.isAI && !game.p2Choice) game.p2Choice = getRandomChoice();
            
            io.to(game.roomId).emit('chatMessage', { sender: 'System', msg: 'Time expired! Auto-selecting weapons.' });
            resolveRound(game);
        }, 10000);
    }

    function updateScore(game) {
        game.room.p1.emit('scoreUpdate', { you: game.p1Score, opp: game.p2Score });
        if(!game.room.isAI) game.room.p2.emit('scoreUpdate', { you: game.p2Score, opp: game.p1Score });
        game.room.spectators.forEach(spec => spec.emit('scoreUpdate', { you: game.p1Score, opp: game.p2Score }));
    }

    function resolveRound(game) {
        if (game.timerId) { clearTimeout(game.timerId); game.timerId = null; }
        
        // Handle Hacks
        if (game.p1Choice === 'hack' && game.p2Choice === 'hack') {
            game.p1Choice = getRandomChoice(); game.p2Choice = getRandomChoice();
        } else if (game.p1Choice === 'hack') {
            game.p1Choice = counters[game.p2Choice] || 'rock';
        } else if (game.p2Choice === 'hack') {
            game.p2Choice = counters[game.p1Choice] || 'rock';
        }

        const c1 = game.p1Choice; const c2 = game.p2Choice;
        const p1Result = checkWin(c1, c2); let p2Result = 'Draw';
        
        if (p1Result === 'Win') { p2Result = 'Lose'; game.p1Score++; } 
        else if (p1Result === 'Lose') { p2Result = 'Win'; game.p2Score++; }

        const resultDataP1 = { result: p1Result, yourChoice: c1, oppChoice: c2 };
        const resultDataP2 = { result: p2Result, yourChoice: c2, oppChoice: c1 };

        // Save to History for Cinematic Replays
        game.history.push({
            p1Choice: c1, p2Choice: c2, p1Result: p1Result, p2Result: p2Result,
            p1Score: game.p1Score, p2Score: game.p2Score
        });

        game.room.p1.emit('gameResult', resultDataP1);
        if(!game.room.isAI) game.room.p2.emit('gameResult', resultDataP2);
        game.room.spectators.forEach(spec => spec.emit('gameResult', resultDataP1));
        
        updateScore(game);

        if (game.p1Score >= 3 || game.p2Score >= 3) {
            setTimeout(() => {
                const p1WonTourney = game.p1Score >= 3;
                
                // Send history with tournamentOver
                game.room.p1.emit('tournamentOver', { win: p1WonTourney, history: game.history });
                if(!game.room.isAI) game.room.p2.emit('tournamentOver', { win: !p1WonTourney, history: game.history });
                game.room.spectators.forEach(spec => spec.emit('tournamentOver', { win: p1WonTourney, history: game.history }));
                
                game.p1Score = 0; game.p2Score = 0;
                game.p1Hacks = 1; game.p2Hacks = 1; 
                game.history = []; // Reset history
                updateScore(game);
            }, 2000);
        } else {
            setTimeout(() => { startRound(game); }, 3000);
        }
    }

    // --- GAME ACTIONS ---
    socket.on('choice', (choice) => {
        const game = socket.game;
        if (!game || socket.isSpectator) return;

        if (choice === 'hack') {
            if (socket.playerNum === 1 && game.p1Hacks > 0) { game.p1Hacks--; }
            else if (socket.playerNum === 2 && game.p2Hacks > 0) { game.p2Hacks--; }
            else return; 
        }

        if (socket.playerNum === 1) {
            game.p1Choice = choice;
            if (game.room.isAI) game.p2Choice = getRandomChoice(); 
        } else {
            game.p2Choice = choice;
        }

        if (game.p1Choice && game.p2Choice) resolveRound(game);
    });

    socket.on('rematch', () => {
        const game = socket.game;
        if (game && socket.playerNum === 1) startRound(game);
    });

    // --- CHAT ---
    socket.on('chatMessage', (msg) => {
        const game = socket.game;
        if (game) io.to(game.roomId).emit('chatMessage', { sender: socket.username, msg });
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p !== socket);
        let foundRoom = null;
        for (const code in rooms) {
            if (rooms[code].p1 === socket || rooms[code].p2 === socket || rooms[code].spectators.includes(socket)) {
                foundRoom = code; break;
            }
        }
        if (foundRoom) {
            const room = rooms[foundRoom];
            if (socket.isSpectator) {
                room.spectators = room.spectators.filter(s => s !== socket);
            } else {
                io.to(foundRoom).emit('opponentLeft');
                if (room.game && room.game.timerId) clearTimeout(room.game.timerId);
                delete rooms[foundRoom];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
