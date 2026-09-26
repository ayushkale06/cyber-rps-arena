if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW Registration failed: ", err));

const socket = io();

// UI Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const statusDiv = document.getElementById('status');
const gameArea = document.getElementById('game-area');
const resultArea = document.getElementById('result-area');
const bottomPanels = document.getElementById('bottom-panels');
const tourneyOverlay = document.getElementById('tourney-overlay');
const tourneyResultText = document.getElementById('tourney-result-text');
const timerContainer = document.getElementById('timer-container');
const timerBar = document.getElementById('timer-bar');
const spectatorMsg = document.getElementById('spectator-msg');
const replayMsg = document.getElementById('replay-msg');
const choicesContainer = document.getElementById('choices-container');
const extraControls = document.getElementById('extra-controls');
const gameWrapper = document.querySelector('.game-wrapper');

// Buttons
const btnQuick = document.getElementById('btn-quick'), btnAI = document.getElementById('btn-ai'), btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join'), btnQuit = document.getElementById('btn-quit'), btnRematch = document.getElementById('btn-rematch');
const btnMenu = document.getElementById('btn-menu'), btnLang = document.getElementById('btn-lang'), btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam'), btnScan = document.getElementById('btn-scan'), btnHack = document.getElementById('btn-hack');
const btnReplay = document.getElementById('btn-replay');
const choiceButtons = document.querySelectorAll('.choice-btn');
const avatarRadios = document.querySelectorAll('input[name="avatar"]');

// Inputs & Labels
const usernameInput = document.getElementById('username-input'), roomCodeInput = document.getElementById('room-code-input'), wagerInput = document.getElementById('wager-input');
const lobbyError = document.getElementById('lobby-error');
const xpDisplay = document.getElementById('xp-display'), bankDisplay = document.getElementById('bank-display');
const gameBank = document.getElementById('game-bank'), gameWager = document.getElementById('game-wager');
const myNameDisplay = document.getElementById('my-name-display'), oppNameDisplay = document.getElementById('opp-name-display');
const myAvatarDisplay = document.getElementById('my-avatar'), oppAvatarDisplay = document.getElementById('opp-avatar');
const myScoreDisplay = document.getElementById('my-score'), oppScoreDisplay = document.getElementById('opp-score');
const roundResult = document.getElementById('round-result'), myChoiceSpan = document.getElementById('my-choice'), oppChoiceSpan = document.getElementById('opp-choice');

// Panels
const chatMessages = document.getElementById('chat-messages'), chatInput = document.getElementById('chat-input'), btnSendChat = document.getElementById('btn-send-chat');
const combatLog = document.getElementById('combat-log');
const camContainer = document.getElementById('cam-container'), webcam = document.getElementById('webcam'), scanLine = document.getElementById('scan-line');

let roundCounter = 1; let isSpectator = false; let isHost = false; let currentWager = 10; let tournamentHistory = [];

// --- ECONOMY & XP ---
let xp = parseInt(localStorage.getItem('rps_xp') || '0');
let level = Math.floor(xp / 100) + 1;
let bank = parseInt(localStorage.getItem('rps_bank') || '1000');

function updateMetaUi() {
    level = Math.floor(xp / 100) + 1;
    if (bank <= 0) bank = 100;
    localStorage.setItem('rps_xp', xp); localStorage.setItem('rps_bank', bank);
    xpDisplay.textContent = `LVL ${level} (${xp % 100}/100 XP)`;
    bankDisplay.textContent = `BANK: ${bank} ₵`;
    gameBank.textContent = bank;
    if(level >= 5) document.getElementById('avatar-king').classList.remove('hidden');
    if(level >= 10) document.getElementById('avatar-dragon').classList.remove('hidden');
}
updateMetaUi();

// --- LEETSPEAK ---
let isLeet = false;
function toLeet(text) {
    if(!isLeet) return text;
    return text.toUpperCase().replace(/A/g,'4').replace(/E/g,'3').replace(/I/g,'1').replace(/O/g,'0').replace(/S/g,'5').replace(/T/g,'7');
}
function applyLeetspeak() {
    btnLang.textContent = isLeet ? '[ L33T ]' : '[ EN ]';
    document.querySelectorAll('.l33t-target').forEach(el => {
        if(!el.dataset.orig) el.dataset.orig = el.textContent;
        el.textContent = isLeet ? toLeet(el.dataset.orig) : el.dataset.orig;
    });
    document.querySelectorAll('.l33t-target-placeholder').forEach(el => {
        if(!el.dataset.orig) el.dataset.orig = el.placeholder;
        el.placeholder = isLeet ? toLeet(el.dataset.orig) : el.dataset.orig;
    });
    if(statusDiv.dataset.current) statusDiv.textContent = isLeet ? toLeet(statusDiv.dataset.current) : statusDiv.dataset.current;
}
btnLang.addEventListener('click', () => { isLeet = !isLeet; applyLeetspeak(); playSound('click'); });
function setStatus(text) { statusDiv.dataset.current = text; statusDiv.textContent = isLeet ? toLeet(text) : text; }

// --- WEBCAM ML SCANNER ---
let camStream = null;
btnCam.addEventListener('click', async () => {
    playSound('click');
    if(camStream) {
        camStream.getTracks().forEach(t => t.stop()); camStream = null;
        camContainer.classList.add('hidden'); btnScan.classList.add('hidden');
        btnCam.style.borderColor = ''; btnCam.style.color = '';
    } else {
        try {
            camStream = await navigator.mediaDevices.getUserMedia({video: true});
            webcam.srcObject = camStream;
            camContainer.classList.remove('hidden'); btnScan.classList.remove('hidden');
            btnCam.style.borderColor = '#00ffaa'; btnCam.style.color = '#00ffaa';
        } catch(e) { alert("Camera access denied."); }
    }
});

btnScan.addEventListener('click', () => {
    if(choiceButtons[0].disabled) return;
    playSound('click');
    scanLine.classList.remove('hidden'); scanLine.classList.add('scanning-active');
    btnScan.textContent = "ANALYZING..."; disableButtons();
    
    let attempts = 0;
    const scanInterval = setInterval(() => {
        attempts++;
        let detected = window.scanHandGesture ? window.scanHandGesture() : null;
        if(detected || attempts > 25) { 
            clearInterval(scanInterval);
            scanLine.classList.add('hidden'); scanLine.classList.remove('scanning-active');
            btnScan.textContent = "SCAN"; enableButtons();
            
            if(detected) {
                playSound('found'); setStatus(`GESTURE DETECTED: ${detected.toUpperCase()}`);
                document.querySelector(`.choice-btn.${detected}`).click();
            } else {
                playSound('lose'); setStatus('NO GESTURE DETECTED. TRY AGAIN.');
            }
        }
    }, 100);
});

// --- VOICE RECOGNITION ---
let recognizing = false, recognition = null;
if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = (e) => {
        const transcript = e.results[e.results.length - 1][0].transcript.toLowerCase();
        ['rock', 'paper', 'scissors', 'lizard', 'spock'].forEach(w => {
            if(transcript.includes(w) && !choiceButtons[0].disabled) { document.querySelector(`.choice-btn.${w}`).click(); playSound('found'); }
        });
    };
    btnMic.addEventListener('click', () => {
        playSound('click');
        if(recognizing) { recognition.stop(); recognizing = false; btnMic.classList.remove('active-mic'); btnMic.innerHTML = '🎤 VOICE'; }
        else { recognition.start(); recognizing = true; btnMic.classList.add('active-mic'); btnMic.innerHTML = '🎤 LISTENING...'; }
    });
} else btnMic.style.display = 'none';

const emojis = { 'rock': '🪨', 'paper': '📄', 'scissors': '✂️', 'lizard': '🦎', 'spock': '🖖', 'hack': '⚠️' };
const verbs = { 'rock': { 'scissors': 'crushes', 'lizard': 'crushes' }, 'paper': { 'rock': 'covers', 'spock': 'disproves' }, 'scissors': { 'paper': 'cuts', 'lizard': 'decapitates' }, 'lizard': { 'spock': 'poisons', 'paper': 'eats' }, 'spock': { 'scissors': 'smashes', 'rock': 'vaporizes' } };

// --- AUDIO & PARTICLES ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime;
    if (type === 'click') { osc.type = 'square'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(100, now+0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.1); osc.start(now); osc.stop(now+0.1); }
    else if (type === 'found') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.setValueAtTime(400, now+0.1); osc.frequency.setValueAtTime(500, now+0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.3); osc.start(now); osc.stop(now+0.3); }
    else if (type === 'win') { osc.type = 'sine'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554, now+0.1); osc.frequency.setValueAtTime(659, now+0.2); osc.frequency.setValueAtTime(880, now+0.3); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.6); osc.start(now); osc.stop(now+0.6); }
    else if (type === 'lose') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(50, now+0.5); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.5); osc.start(now); osc.stop(now+0.5); }
    else if (type === 'tourneyWin') { osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.setValueAtTime(600, now+0.2); osc.frequency.setValueAtTime(800, now+0.4); osc.frequency.setValueAtTime(1200, now+0.6); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+1.0); osc.start(now); osc.stop(now+1.0); }
}
function shootConfetti() { confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } }); }
function tourneyConfetti() { var d = 3000, end = Date.now()+d, def = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 101 };
    var int = setInterval(() => { var t = end - Date.now(); if(t<=0) return clearInterval(int); var pc = 50*(t/d); confetti(Object.assign({}, def, { particleCount: pc, origin: { x: Math.random()*(0.3-0.1)+0.1, y: Math.random()-0.2 } })); confetti(Object.assign({}, def, { particleCount: pc, origin: { x: Math.random()*(0.9-0.7)+0.7, y: Math.random()-0.2 } })); }, 250);
}

function getSelectedAvatar() { let selected = '🤖'; avatarRadios.forEach(r => { if(r.checked) selected = r.value; }); return selected; }

// --- LOBBY LOGIC ---
function doJoin(action, forceHost = true) {
    playSound('click'); isHost = forceHost;
    currentWager = parseInt(wagerInput.value) || 10;
    if(currentWager > bank) currentWager = bank; if(currentWager < 1) currentWager = 1;
    gameWager.textContent = currentWager;

    const name = usernameInput.value.trim() || 'USER'; const code = roomCodeInput.value.trim();
    if(action === 'joinRoom' && !code) { lobbyError.textContent = "ENTER ROOM CODE"; return; }
    myNameDisplay.innerHTML = `${isLeet?toLeet(name):name} <span style="color: #4ade80;">[Lv${level}]</span>`;
    socket.emit(action, { name, code, avatar: getSelectedAvatar(), level });
    lobbyScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
}
btnQuick.addEventListener('click', () => doJoin('joinRandom')); btnAI.addEventListener('click', () => doJoin('joinAI')); btnCreate.addEventListener('click', () => doJoin('createRoom')); btnJoin.addEventListener('click', () => doJoin('joinRoom', false));
btnQuit.addEventListener('click', () => window.location.reload()); btnMenu.addEventListener('click', () => window.location.reload());

btnRematch.addEventListener('click', () => {
    playSound('click'); socket.emit('rematch'); tourneyOverlay.classList.add('hidden'); combatLog.innerHTML = ''; roundCounter = 1; if (!isSpectator) enableButtons(); setStatus('REMATCH INITIALIZED. DEPLOY WEAPON.');
});

// --- SOCKET EVENTS ---
socket.on('errorMsg', (msg) => { lobbyError.textContent = msg; });
socket.on('waiting', (data) => { setStatus(data.msg); statusDiv.classList.add('pulse'); gameArea.classList.add('hidden'); resultArea.classList.add('hidden'); bottomPanels.classList.add('hidden'); timerContainer.classList.add('hidden'); oppNameDisplay.textContent = '???'; oppAvatarDisplay.textContent = '⏳'; myAvatarDisplay.textContent = getSelectedAvatar(); });
socket.on('gameStart', (data) => {
    playSound('found'); oppNameDisplay.innerHTML = `${isLeet?toLeet(data.opponent):data.opponent} <span style="color: #4ade80;">[Lv${data.oppLevel}]</span>`; oppAvatarDisplay.textContent = data.oppAvatar; myAvatarDisplay.textContent = data.yourAvatar;
    setStatus('TARGET LOCKED. BEST OF 5.'); statusDiv.style.borderColor = '#ff007f'; statusDiv.style.color = '#ff007f'; statusDiv.classList.remove('pulse'); gameArea.classList.remove('hidden'); resultArea.classList.add('hidden'); bottomPanels.classList.remove('hidden'); extraControls.classList.remove('hidden');
    combatLog.innerHTML = ''; chatMessages.innerHTML = '<div class="chat-msg"><i>System: Comms channel open.</i></div>'; roundCounter = 1;
});
socket.on('spectatorMode', (data) => {
    isSpectator = true; playSound('found');
    myNameDisplay.innerHTML = `${data.p1} <span style="color:#4ade80;">[Lv${data.p1Level}]</span>`; myAvatarDisplay.textContent = data.p1Avatar;
    oppNameDisplay.innerHTML = `${data.p2} <span style="color:#4ade80;">[Lv${data.p2Level}]</span>`; oppAvatarDisplay.textContent = data.p2Avatar;
    myScoreDisplay.textContent = data.p1Score; oppScoreDisplay.textContent = data.p2Score;
    setStatus('OBSERVING MATCH...'); gameArea.classList.remove('hidden'); resultArea.classList.add('hidden'); bottomPanels.classList.remove('hidden'); choicesContainer.classList.add('hidden'); extraControls.classList.add('hidden'); spectatorMsg.classList.remove('hidden');
});
socket.on('roundStart', (data) => {
    resultArea.classList.add('hidden'); setStatus(isSpectator ? 'AWAITING COMBATANTS...' : 'TIMER ACTIVE! DEPLOY WEAPON!'); statusDiv.classList.remove('pulse'); if (!isSpectator) enableButtons();
    timerContainer.classList.remove('hidden'); timerBar.style.transition = 'none'; timerBar.style.width = '100%'; timerBar.style.backgroundColor = '#66fcf1'; void timerBar.offsetWidth;
    timerBar.style.transition = `width ${data.duration}ms linear, background-color ${data.duration}ms linear`; timerBar.style.width = '0%'; timerBar.style.backgroundColor = '#ff0044';
});
socket.on('hacksUpdate', (hacksLeft) => { if(hacksLeft > 0) { btnHack.style.display = 'block'; btnHack.dataset.orig = `⚠️ OVERRIDE (${hacksLeft})`; applyLeetspeak(); } else btnHack.style.display = 'none'; });
socket.on('opponentLeft', () => { setStatus('CONNECTION LOST. SYSTEM HALTED.'); statusDiv.classList.add('pulse'); gameArea.classList.add('hidden'); bottomPanels.classList.add('hidden'); tourneyOverlay.classList.add('hidden'); timerContainer.classList.add('hidden'); oppNameDisplay.textContent = '???'; });
socket.on('scoreUpdate', (data) => { myScoreDisplay.textContent = data.you; oppScoreDisplay.textContent = data.opp; });

function addCombatLog(result, myChoice, oppChoice, rNum = null) {
    const div = document.createElement('div'); div.className = 'log-msg l33t-target';
    const myE = emojis[myChoice]; const oppE = emojis[oppChoice];
    const r = rNum !== null ? rNum : roundCounter;
    let text = '';
    if (result === 'Win') text = `<span>R${r}:</span> ${myE} defeated ${oppE} (Win)`;
    else if (result === 'Lose') text = `<span>R${r}:</span> ${oppE} defeated ${myE} (Loss)`;
    else text = `<span>R${r}:</span> ${myE} clashes with ${oppE} (Draw)`;
    div.dataset.orig = text; div.innerHTML = isLeet ? toLeet(text) : text;
    combatLog.prepend(div); if(rNum === null) roundCounter++;
}

socket.on('gameResult', (data) => {
    resultArea.classList.remove('hidden'); timerContainer.classList.add('hidden'); setStatus('CALCULATING RESULT...');
    myChoiceSpan.textContent = emojis[data.yourChoice]; oppChoiceSpan.textContent = emojis[data.oppChoice];
    
    // Trigger clash animation by resetting the element
    myChoiceSpan.classList.remove('clash-left'); void myChoiceSpan.offsetWidth; myChoiceSpan.classList.add('clash-left');
    oppChoiceSpan.classList.remove('clash-right'); void oppChoiceSpan.offsetWidth; oppChoiceSpan.classList.add('clash-right');
    
    addCombatLog(data.result, data.yourChoice, data.oppChoice);
    
    if (data.result === 'Win') {
        playSound('win'); if(!isSpectator) { shootConfetti(); xp += 50; bank += currentWager; updateMetaUi(); gameWrapper.classList.add('shake'); setTimeout(()=>gameWrapper.classList.remove('shake'), 400); }
        roundResult.dataset.orig = isSpectator ? 'PLAYER 1 WINS' : 'VICTORY'; roundResult.style.color = '#00ffaa'; 
    } else if (data.result === 'Lose') {
        playSound('lose'); if(!isSpectator) { xp += 10; bank -= currentWager; updateMetaUi(); gameWrapper.classList.add('shake'); setTimeout(()=>gameWrapper.classList.remove('shake'), 400); }
        roundResult.dataset.orig = isSpectator ? 'PLAYER 2 WINS' : 'DEFEATED'; roundResult.style.color = '#ff0044'; 
    } else {
        playSound('click'); if(!isSpectator) { xp += 25; updateMetaUi(); }
        roundResult.dataset.orig = 'DRAW'; roundResult.style.color = '#ffaa00'; 
    }
    roundResult.textContent = isLeet ? toLeet(roundResult.dataset.orig) : roundResult.dataset.orig;
    if (!isSpectator) disableButtons();
});

socket.on('tournamentOver', (data) => {
    tournamentHistory = data.history; 
    tourneyOverlay.classList.remove('hidden'); btnReplay.classList.remove('hidden');
    if (data.win) {
        playSound('tourneyWin'); tourneyConfetti();
        tourneyResultText.dataset.orig = isSpectator ? "PLAYER 1 WINS" : "GRAND CHAMPION";
        tourneyResultText.style.color = '#00ffaa'; tourneyResultText.style.textShadow = '0 0 20px #00ffaa';
    } else {
        playSound('lose');
        tourneyResultText.dataset.orig = isSpectator ? "PLAYER 2 WINS" : "DEFEATED";
        tourneyResultText.style.color = '#ff0044'; tourneyResultText.style.textShadow = '0 0 20px #ff0044';
        if(isSpectator) tourneyConfetti();
    }
    tourneyResultText.textContent = isLeet ? toLeet(tourneyResultText.dataset.orig) : tourneyResultText.dataset.orig;
    btnRematch.classList.toggle('hidden', !isHost); btnMenu.classList.toggle('hidden', isHost);
    if (!isSpectator) disableButtons();
});

// --- REPLAY LOGIC ---
btnReplay.addEventListener('click', () => {
    playSound('click'); tourneyOverlay.classList.add('hidden');
    extraControls.classList.add('hidden'); choicesContainer.classList.add('hidden'); replayMsg.classList.remove('hidden');
    combatLog.innerHTML = '';
    
    let step = 0;
    const interval = setInterval(() => {
        if(step >= tournamentHistory.length) { clearInterval(interval); setTimeout(() => tourneyOverlay.classList.remove('hidden'), 2000); return; }
        const r = tournamentHistory[step];
        resultArea.classList.remove('hidden'); setStatus(`REPLAY: ROUND ${step+1}`);
        myChoiceSpan.textContent = emojis[r.p1Choice]; oppChoiceSpan.textContent = emojis[r.p2Choice];
        myScoreDisplay.textContent = r.p1Score; oppScoreDisplay.textContent = r.p2Score;
        
        myChoiceSpan.classList.remove('clash-left'); void myChoiceSpan.offsetWidth; myChoiceSpan.classList.add('clash-left');
        oppChoiceSpan.classList.remove('clash-right'); void oppChoiceSpan.offsetWidth; oppChoiceSpan.classList.add('clash-right');
        
        addCombatLog(r.p1Result, r.p1Choice, r.p2Choice, step+1);
        
        if (r.p1Result === 'Win') { playSound('win'); roundResult.dataset.orig = 'VICTORY'; roundResult.style.color = '#00ffaa'; gameWrapper.classList.add('shake'); setTimeout(()=>gameWrapper.classList.remove('shake'), 400);}
        else if (r.p1Result === 'Lose') { playSound('lose'); roundResult.dataset.orig = 'DEFEATED'; roundResult.style.color = '#ff0044'; gameWrapper.classList.add('shake'); setTimeout(()=>gameWrapper.classList.remove('shake'), 400);}
        else { playSound('click'); roundResult.dataset.orig = 'DRAW'; roundResult.style.color = '#ffaa00'; }
        roundResult.textContent = isLeet ? toLeet(roundResult.dataset.orig) : roundResult.dataset.orig;
        step++;
    }, 2500);
});

// --- GAME LOGIC ---
choiceButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if(isSpectator) return; playSound('click');
        const choice = btn.getAttribute('data-choice');
        socket.emit('choice', choice); setStatus('EXECUTING... AWAITING ENEMY...'); statusDiv.classList.add('pulse'); disableButtons();
    });
});
btnHack.addEventListener('click', () => {
    if(isSpectator) return; playSound('click');
    socket.emit('choice', 'hack'); setStatus('OVERRIDE ACTIVE... AWAITING ENEMY...'); statusDiv.classList.add('pulse'); disableButtons();
});
function disableButtons() { choiceButtons.forEach(btn => btn.disabled = true); btnHack.disabled = true; btnScan.disabled = true; }
function enableButtons() { choiceButtons.forEach(btn => btn.disabled = false); btnHack.disabled = false; btnScan.disabled = false; }

// --- CHAT LOGIC ---
btnSendChat.addEventListener('click', sendChat); chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
function sendChat() { const msg = chatInput.value.trim(); if (msg) { socket.emit('chatMessage', msg); chatInput.value = ''; } }
socket.on('chatMessage', (data) => {
    const div = document.createElement('div'); div.className = 'chat-msg';
    const cleanMsg = isLeet ? toLeet(data.msg) : data.msg;
    div.innerHTML = `<b>${data.sender}:</b> ${cleanMsg}`;
    chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
});
