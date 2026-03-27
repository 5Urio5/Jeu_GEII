/* global DB, confetti, XLSX */

// ==========================================
// 🔒 SÉCURITÉ : MOT DE PASSE ADMINISTRATEUR
// ==========================================
const ADMIN_PASSWORD = "iutgeii";

// ==========================================
// FIREBASE - CONNEXION BASE DE DONNÉES TEMPS RÉEL
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getDatabase, ref, push, get, set } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA5xccoSduwPvhrnR769i_2Fhp9zW63C5M",
  authDomain: "jeu-geii.firebaseapp.com",
  databaseURL: "https://jeu-geii-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "jeu-geii",
  storageBucket: "jeu-geii.firebasestorage.app",
  messagingSenderId: "891268021614",
  appId: "1:891268021614:web:18ff4b03d9ea07f284157f",
  measurementId: "G-TMHEK2JKFS"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);

// Exposition des fonctions au HTML
window.startQuiz = startQuiz;
window.goToStart = goToStart;
window.cancelQuiz = cancelQuiz;
window.showPodium = showPodium;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleKeep = toggleKeep;
window.resetPodium = resetPodium;
window.downloadExcel = downloadExcel;
window.showScreensaver = showScreensaver;
window.hideScreensaver = hideScreensaver;
window.goToNextQuestion = goToNextQuestion;
window.togglePasswordVisibility = togglePasswordVisibility;

// ==========================================
// 🛡️ SÉCURITÉ : NETTOYEUR XSS
// ==========================================
function sanitizeString(str) {
    return str.replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

// ==========================================
// 🛡️ MODALE DU MOT DE PASSE (PROMESSE)
// ==========================================
function askPassword() {
    return new Promise((resolve) => {
        const modal = document.getElementById('password-modal');
        const input = document.getElementById('admin-pwd-input');
        const submitBtn = document.getElementById('submit-pwd-btn');
        const cancelBtn = document.getElementById('cancel-pwd-btn');
        const toggleBtn = document.getElementById('toggle-pwd-btn');

        input.value = '';
        input.type = 'password';
        toggleBtn.innerText = '👁️';

        modal.classList.add('show');
        input.focus();

        const cleanup = () => {
            modal.classList.remove('show');
            submitBtn.onclick = null;
            cancelBtn.onclick = null;
            input.onkeydown = null;
        };

        submitBtn.onclick = () => { cleanup(); resolve(input.value); };
        cancelBtn.onclick = () => { cleanup(); resolve(null); };
        input.onkeydown = (e) => { 
            if (e.key === 'Enter') { cleanup(); resolve(input.value); } 
            if (e.key === 'Escape') { cleanup(); resolve(null); }
        };
    });
}

function togglePasswordVisibility() {
    const input = document.getElementById('admin-pwd-input');
    const toggleBtn = document.getElementById('toggle-pwd-btn');
    if (input.type === 'password') {
        input.type = 'text';
        toggleBtn.innerText = '🙈';
    } else {
        input.type = 'password';
        toggleBtn.innerText = '👁️';
    }
}

// ==========================================
// FONDS D'ÉCRAN DYNAMIQUES
// ==========================================
const bgImages = ['appmeas.jpg', 'intérieur_iut.jpg', 'iut.jpg', 'kart.jpg', 'platine.jpg'];

function setRandomBackground() {
    const randomImg = bgImages[Math.floor(Math.random() * bgImages.length)];
    document.body.style.backgroundImage = `url('${randomImg}')`;
}

// ==========================================
// VARIABLES DE JEU
// ==========================================
let playerName = "";
let currentQuestions = [];
let currentQIndex = 0;
let scoresPoints = {AII: 0, EME: 0, ESE: 0};
let scoresCount = {AII: 0, EME: 0, ESE: 0};
let scoreTotal = 0;
let currentStreak = 0;
let playerSessionDetails = []; 
let totalQuestions = 30; 
let timeLimit = 30; 
let timeLeft = timeLimit;
let timerInterval;
let idleTimer; 
const IDLE_TIME = 120000; 

// ==========================================
// GESTION AUDIO (Synthétiseur)
// ==========================================
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playSound(type) {
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'correct') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.setValueAtTime(1046, now + 0.1);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'wrong' || type === 'timeout') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'fast-tick') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'drumroll') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(60, now);
        const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 25; 
        const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 50;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency); lfo.start(now); lfo.stop(now + 3);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.5, now + 2); gain.gain.linearRampToValueAtTime(0, now + 3);
        osc.start(now); osc.stop(now + 3);
    }
}

// ==========================================
// LOGIQUE INTERFACE & SLIDES
// ==========================================
function slideTo(screenId) {
    const active = document.querySelector('.active-screen');
    if (active && active.id === screenId) return; 

    if (active) {
        active.classList.remove('active-screen'); active.classList.add('slide-out-left');
        setTimeout(() => { active.classList.add('hidden'); active.classList.remove('slide-out-left'); }, 400);
    }
    const nextScreen = document.getElementById(screenId);
    nextScreen.classList.remove('hidden'); nextScreen.classList.add('slide-in-right');
    void nextScreen.offsetWidth; // Force le reflow
    nextScreen.classList.remove('slide-in-right'); nextScreen.classList.add('active-screen');
}

function goToStart() {
    document.getElementById('player-name').value = '';
    setRandomBackground(); 
    resetIdleTimer();
    slideTo('screen-start');
    setTimeout(() => { document.getElementById('player-name').focus(); }, 400); // Focus auto sur l'input
}

function cancelQuiz() {
    if (confirm("⚠️ Es-tu sûr de vouloir annuler la partie en cours ?\n\nTa progression ne sera pas sauvegardée et n'apparaîtra pas dans le classement. Tu perdras tout.")) {
        clearInterval(timerInterval);
        goToStart();
    }
}

function getRandom(arr, n) {
    let shuffled = [...arr].sort(() => 0.5 - Math.random()); return shuffled.slice(0, n);
}

// ==========================================
// MOTEUR DU QUIZ
// ==========================================
async function startQuiz() {
    let rawName = document.getElementById('player-name').value.trim();
    if (!rawName) return alert("Hé ! N'oublie pas de taper ton prénom !");
    
    let safeName = sanitizeString(rawName);
    document.getElementById('player-name').blur(); 
    
    // Débloque l'audio navigateur
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // 🔥 CHEAT CODE / EASTER EGG POUR "MANON"
    if (safeName.toLowerCase() === "manon") {
        playerName = "Manon";
        scoresCount = {AII: 5, EME: 7, ESE: 6}; 
        scoresPoints = {AII: 4433, EME: 6451, ESE: 5567}; 
        scoreTotal = 16451; 
        
        playerSessionDetails = [];
        for(let i = 0; i < 30; i++) {
            let fakeCat = i < 10 ? "AII" : (i < 20 ? "EME" : "ESE");
            playerSessionDetails.push({
                cat: fakeCat, q: `Question masquée ${i+1} (Mode Démo)`, 
                isCorrect: true, time: 1.5, points: 850
            });
        }
        triggerSuspense();
        return; 
    }

    // 🛡️ VÉRIFICATION ANTI-DOUBLONS FIREBASE
    try {
        const snapshot = await get(ref(db, 'scores'));
        if (snapshot.exists()) {
            const scoresObj = snapshot.val();
            for (let key in scoresObj) {
                if (scoresObj[key].Candidat.toLowerCase() === safeName.toLowerCase()) {
                    return alert("⚠️ Ce prénom est déjà pris sur le classement !\n\nEssaie de rajouter l'initiale de ton nom de famille (ex: " + safeName + " D).");
                }
            }
        }
    } catch(e) { console.error("Erreur de connexion pour la vérification du nom", e); }

    // Initialisation
    playerName = safeName;
    scoresPoints = {AII: 0, EME: 0, ESE: 0};
    scoresCount = {AII: 0, EME: 0, ESE: 0};
    scoreTotal = 0; currentStreak = 0; currentQIndex = 0; playerSessionDetails = [];
    
    // Génération aléatoire des questions
    let selected = [];
    ['AII', 'EME', 'ESE'].forEach(cat => {
        let catQ = DB.filter(q => q.cat === cat);
        let qCom = getRandom(catQ.filter(q => q.diff === "Com"), 2);
        let qSTI = getRandom(catQ.filter(q => q.diff === "STI"), 3);
        let qBU1 = getRandom(catQ.filter(q => q.diff === "BU1"), 3);
        let qBU2 = getRandom(catQ.filter(q => q.diff === "BU2"), 2);
        selected = selected.concat(qCom, qSTI, qBU1, qBU2);
    });
    
    currentQuestions = selected.sort(() => 0.5 - Math.random());
    
    let progContainer = document.getElementById('progress-container');
    progContainer.innerHTML = '';
    for(let i=0; i<30; i++) { progContainer.innerHTML += `<div class="progress-box" id="box-${i}"></div>`; }

    document.getElementById('player-display').innerHTML = `👤 ${playerName} <span style="margin-left:20px; color:#f1c40f;" id="live-score">0 pts</span>`;
    
    slideTo('screen-game'); 
    loadQuestion();
}

function loadQuestion() {
    resetIdleTimer(); 
    setRandomBackground(); 
    clearInterval(timerInterval); timeLeft = timeLimit;
    
    let timerBar = document.getElementById('timer-bar');
    timerBar.style.width = "100%"; timerBar.style.backgroundColor = "#2ecc71"; 
    updateTimerText();

    let qData = currentQuestions[currentQIndex];
    document.getElementById('question-text').innerText = `Q${currentQIndex + 1}/${totalQuestions} : ${qData.q}`;
    
    let container = document.getElementById('answers-container'); container.innerHTML = ''; 
    let options = qData.opt.map((text, index) => ({text, originalIndex: index}));
    options.sort(() => 0.5 - Math.random()); // Mélange des réponses
    
    options.forEach((opt, arrayIndex) => {
        let btn = document.createElement('button');
        btn.className = 'answer-btn'; 
        btn.innerText = opt.text; 
        btn.dataset.idx = opt.originalIndex; 
        btn.onclick = (e) => processAnswer(opt.originalIndex, qData.ans, e.target);
        container.appendChild(btn);
    });

    // Auto-focus sur la première réponse pour faciliter la navigation au clavier !
    setTimeout(() => {
        let firstBtn = document.querySelector('.answer-btn');
        if (firstBtn) firstBtn.focus();
    }, 100);

    timerInterval = setInterval(() => {
        timeLeft--; updateTimerText();
        if(timeLeft > 0 && timeLeft <= 10) playSound('fast-tick'); else if (timeLeft > 10) playSound('tick');
        
        let pct = (timeLeft / timeLimit) * 100;
        timerBar.style.width = pct + "%";
        if (pct < 50 && pct > 20) timerBar.style.backgroundColor = "#f1c40f"; 
        if (pct <= 20) timerBar.style.backgroundColor = "#e74c3c"; 

        if (timeLeft <= 0) processAnswer(-1, qData.ans, null); 
    }, 1000);
}

function updateTimerText() { document.getElementById('timer-text').innerText = `⏱️ ${timeLeft}s`; }

function processAnswer(selectedIndex, correctIndex, clickedBtn) {
    clearInterval(timerInterval);
    let allBtns = document.querySelectorAll('.answer-btn');
    allBtns.forEach(b => b.disabled = true);
    
    let qData = currentQuestions[currentQIndex];
    let isTimeout = (selectedIndex === -1);
    let isCorrect = (selectedIndex === correctIndex);
    let box = document.getElementById(`box-${currentQIndex}`);
    let timeTaken = timeLimit - timeLeft;
    let pointsGained = 0;
    
    if (isCorrect) {
        scoresCount[qData.cat]++; currentStreak++; playSound('correct');
        if(clickedBtn) clickedBtn.classList.add('btn-correct');
        box.classList.add('prog-correct');
        pointsGained = Math.round((timeLeft / timeLimit) * 500) + 500;
        scoreTotal += pointsGained; scoresPoints[qData.cat] += pointsGained;
    } else {
        currentStreak = 0;
        playSound(isTimeout ? 'timeout' : 'wrong');
        if(clickedBtn) clickedBtn.classList.add('btn-wrong');
        allBtns.forEach(b => { if (parseInt(b.dataset.idx) === correctIndex) b.classList.add('btn-correct'); });
        box.classList.add('prog-wrong');
    }
    
    playerSessionDetails.push({
        cat: qData.cat, q: qData.q, isCorrect: isCorrect, time: timeTaken, points: pointsGained
    });

    document.getElementById('live-score').innerText = `${scoreTotal} pts`;
    
    setTimeout(() => { 
        showIntermediateScreen(isCorrect, pointsGained, qData.trivia, isTimeout); 
    }, 1500);
}

function showIntermediateScreen(isCorrect, points, trivia, isTimeout) {
    resetIdleTimer();
    let title = document.getElementById('intermediate-title');
    let ptsText = document.getElementById('intermediate-points');
    let streakText = document.getElementById('intermediate-streak');
    
    if (isTimeout) {
        title.innerText = "⏱️ Temps écoulé !"; title.style.color = "#f39c12";
        ptsText.innerText = "0 pts"; ptsText.style.color = "#bdc3c7";
    } else if (isCorrect) {
        title.innerText = "Bonne réponse !"; title.style.color = "#2ecc71";
        ptsText.innerText = `+ ${points} pts`; ptsText.style.color = "white";
    } else {
        title.innerText = "Aïe, mauvaise réponse..."; title.style.color = "#e74c3c";
        ptsText.innerText = "0 pts"; ptsText.style.color = "#bdc3c7";
    }
    
    if (currentStreak >= 3) {
        streakText.innerText = `Série en cours : ${currentStreak} bonnes réponses 🔥 !`;
        streakText.style.display = "block";
    } else { streakText.style.display = "none"; }
    
    document.getElementById('trivia-text').innerText = trivia;
    slideTo('screen-intermediate');
    
    // Auto-focus sur le bouton "Question suivante" pour valider direct à l'Entrée
    setTimeout(() => {
        let nextBtn = document.querySelector('#screen-intermediate .main-btn');
        if(nextBtn) nextBtn.focus();
    }, 400);
}

function goToNextQuestion() {
    currentQIndex++;
    if (currentQIndex < totalQuestions) {
        slideTo('screen-game'); 
        setTimeout(() => loadQuestion(), 400);
    } else { 
        triggerSuspense(); 
    }
}

function triggerSuspense() {
    slideTo('screen-suspense'); playSound('drumroll');
    setTimeout(async () => { 
        await showResults(); 
        window.confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 10000 }); 
    }, 3000);
}

// ==========================================
// RÉSULTATS & RÉCOLTE DE MAIL
// ==========================================
async function showResults() {
    resetIdleTimer();
    let htmlScores = ""; let bestCat = ""; let maxScore = -1;
    
    for (let cat of ["AII", "EME", "ESE"]) {
        let count = scoresCount[cat]; let pts = scoresPoints[cat];
        let color = count >= 6 ? "#2ecc71" : (count >= 4 ? "#f1c40f" : "#e74c3c");
        htmlScores += `Parcours ${cat} : <span style="color:${color}; font-weight:bold;">${count}/10</span> - <span style="color:#bdc3c7;">${pts} pts</span><br>`;
        if (count > maxScore) { maxScore = count; bestCat = cat; } else if (count === maxScore) { bestCat += " & " + cat; }
    }
    
    document.getElementById('final-score').innerText = `Score Final : ${scoreTotal} pts`;
    document.getElementById('scores-display').innerHTML = htmlScores;
    document.getElementById('best-path').innerText = `👉 PARCOURS CONSEILLÉ : ${bestCat} 👈`;

    let rank = 1;
    try {
        const snapshot = await get(ref(db, 'scores'));
        if (snapshot.exists()) {
            const scoresObj = snapshot.val();
            for (let key in scoresObj) {
                if (scoresObj[key]["Score Points"] > scoreTotal) { rank++; }
            }
        }
    } catch(e) { console.error("Erreur classement", e); }

    let playerEmail = "";
    if (rank <= 3) {
        let emailPrompt = prompt(`🎉 INCROYABLE ! Tu te hisses à la place #${rank} du classement mondial !\n\nLaisse-nous ton adresse e-mail pour que l'on puisse te recontacter si tu restes sur le podium :`);
        if (emailPrompt) playerEmail = sanitizeString(emailPrompt.trim());
    }

    saveScoreFirebase(playerName, scoreTotal, bestCat, playerEmail);
    slideTo('screen-results');
    
    setTimeout(() => {
        let homeBtn = document.querySelector('#screen-results .main-btn');
        if(homeBtn) homeBtn.focus();
    }, 400);
}

// ==========================================
// FIREBASE : SAUVEGARDE, PODIUM & EXPORT
// ==========================================
function saveScoreFirebase(name, totalScore, profil, email) {
    let newEntry = {
        "Candidat": name, "Score Points": totalScore, "Profil": profil,
        "ScoresCount": scoresCount, "ScoresPoints": scoresPoints, "SessionDetails": playerSessionDetails,
        "keep": false,
        "Email": email || "" 
    };
    push(ref(db, 'scores'), newEntry);
}

async function showPodium() {
    resetIdleTimer();
    slideTo('screen-podium');
    let tbody = document.getElementById('podium-body'); 
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#bdc3c7;">Chargement <div class="spinner"></div></td></tr>';
    
    try {
        const snapshot = await get(ref(db, 'scores'));
        let data = [];
        if (snapshot.exists()) {
            const scoresObj = snapshot.val();
            for (let key in scoresObj) { data.push({ id: key, ...scoresObj[key] }); }
        }
        
        data.sort((a, b) => b["Score Points"] - a["Score Points"]);
        tbody.innerHTML = '';
        
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#bdc3c7;">Aucun joueur enregistré.</td></tr>';
        } else {
            data.forEach((joueur, index) => {
                let medaille = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : ""));
                tbody.innerHTML += `<tr>
                    <td>${medaille} ${index+1}</td>
                    <td>${joueur.Candidat}</td>
                    <td>${joueur["Score Points"]}</td>
                    <td>${joueur.Profil}</td>
                    <td><button class="btn-details" onclick="openModal('${joueur.id}')">Détails 🔍</button></td>
                </tr>`;
            });
        }
    } catch (error) {
        console.error("Erreur Firebase:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">Erreur de connexion réseau ❌</td></tr>';
    }
}

async function openModal(playerId) {
    try {
        const snapshot = await get(ref(db, 'scores'));
        if(!snapshot.exists()) return;
        
        let scoresObj = snapshot.val();
        let allPlayers = Object.values(scoresObj);
        let player = { id: playerId, ...scoresObj[playerId] };
        
        // Calcul des stats de questions
        let globalStats = {};
        allPlayers.forEach(p => {
            if(p.SessionDetails) {
                p.SessionDetails.forEach(q => {
                    if(!globalStats[q.q]) globalStats[q.q] = { asked: 0, correct: 0 };
                    globalStats[q.q].asked++;
                    if(q.isCorrect) globalStats[q.q].correct++;
                });
            }
        });

        let isChecked = player.keep ? "checked" : "";
        document.getElementById('modal-header-content').innerHTML = `
            <h2 style="color:#f1c40f; margin-top:0; display:inline-block;">Analyse de : ${player.Candidat}</h2>
            <label class="keep-label">
                <input type="checkbox" onchange="toggleKeep('${player.id}', this.checked)" ${isChecked}> 
                📌 Conserver
            </label>
        `;

        let tbody = document.getElementById('modal-table-body'); 
        tbody.innerHTML = '';

        if (player.SessionDetails) {
            player.SessionDetails.forEach(q => {
                let resIcon = q.isCorrect ? `<span class="correct-cell">✅</span>` : `<span class="incorrect-cell">❌</span>`;
                let successRate = "-";
                if (globalStats[q.q] && globalStats[q.q].asked > 0) {
                    successRate = Math.round((globalStats[q.q].correct / globalStats[q.q].asked) * 100) + "%";
                }
                tbody.innerHTML += `<tr>
                    <td style="text-align:center;">${q.cat}</td>
                    <td>${q.q}</td>
                    <td style="text-align:center;">${resIcon}</td>
                    <td style="text-align:center;">${q.time}s</td>
                    <td style="text-align:center;">${q.points}</td>
                    <td style="text-align:center;">${successRate}</td>
                </tr>`;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Aucun détail disponible.</td></tr>`;
        }
        
        document.getElementById('details-modal').classList.add('show');
        
    } catch (error) { console.error("Erreur de modale:", error); }
}

function closeModal() {
    document.getElementById('details-modal').classList.remove('show');
}

async function toggleKeep(playerId, isChecked) {
    try { await set(ref(db, 'scores/' + playerId + '/keep'), isChecked); } 
    catch (error) { console.error("Erreur de MAJ:", error); }
}

async function resetPodium() {
    let pwd = await askPassword();
    if (pwd === ADMIN_PASSWORD) {
        if (confirm("⚠️ Voulez-vous vraiment effacer TOUS les scores ? Action irréversible.")) {
            try {
                await set(ref(db, 'scores'), null);
                alert("🗑️ Base de données réinitialisée !");
                showPodium();
            } catch (error) { alert("Erreur lors de la suppression."); }
        }
    } else if (pwd !== null) { alert("❌ Mot de passe incorrect."); }
}

async function downloadExcel() {
    let pwd = await askPassword();
    if (pwd === ADMIN_PASSWORD) {
        try {
            const snapshot = await get(ref(db, 'scores'));
            if (!snapshot.exists()) return alert("Aucune donnée à exporter.");
            
            let dataPlayers = []; let dataQuestions = []; let dataDetails = [];
            const scoresObj = snapshot.val();
            let allPlayers = Object.values(scoresObj);
            
            for (let key in scoresObj) {
                let p = scoresObj[key];
                dataPlayers.push({
                    "Candidat": p.Candidat || "Inconnu",
                    "Score Global": p["Score Points"] || 0,
                    "Profil": p.Profil || "",
                    "Points AII": p.ScoresPoints ? p.ScoresPoints.AII : 0,
                    "Points EME": p.ScoresPoints ? p.ScoresPoints.EME : 0,
                    "Points ESE": p.ScoresPoints ? p.ScoresPoints.ESE : 0,
                    "Bonnes Rép. AII": p.ScoresCount ? p.ScoresCount.AII : 0,
                    "Bonnes Rép. EME": p.ScoresCount ? p.ScoresCount.EME : 0,
                    "Bonnes Rép. ESE": p.ScoresCount ? p.ScoresCount.ESE : 0,
                    "Email Contact": p.Email || "",
                    "Conserver (Épinglé)": p.keep ? "OUI" : "NON"
                });
                
                if (p.SessionDetails) {
                    p.SessionDetails.forEach((q, index) => {
                        dataDetails.push({
                            "Candidat": p.Candidat, "Numéro Question": index + 1, "Catégorie": q.cat,
                            "Question": q.q, "Résultat": q.isCorrect ? "VRAI" : "FAUX",
                            "Temps de réponse (s)": q.time, "Points Gagnés": q.points
                        });
                    });
                }
            }
            dataPlayers.sort((a, b) => b["Score Global"] - a["Score Global"]);
            
            let globalStats = {};
            allPlayers.forEach(p => {
                if (p.SessionDetails) {
                    p.SessionDetails.forEach(q => {
                        if (!globalStats[q.q]) { globalStats[q.q] = { cat: q.cat, asked: 0, correct: 0 }; }
                        globalStats[q.q].asked++;
                        if (q.isCorrect) globalStats[q.q].correct++;
                    });
                }
            });

            for (let qText in globalStats) {
                let stat = globalStats[qText];
                let successRate = stat.asked > 0 ? Math.round((stat.correct / stat.asked) * 100) + "%" : "0%";
                dataQuestions.push({
                    "Catégorie": stat.cat, "Question": qText, "Fois Posée": stat.asked,
                    "Bonnes Réponses": stat.correct, "Taux de Réussite": successRate
                });
            }
            dataQuestions.sort((a, b) => a.Catégorie.localeCompare(b.Catégorie));
            
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataPlayers), "Classement Joueurs");
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataQuestions), "Stats Questions");
            if(dataDetails.length > 0) {
                window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataDetails), "Détail Sessions");
            }
            
            window.XLSX.writeFile(wb, "Resultats_Jeu_GEII.xlsx");
            
        } catch (e) { alert("Erreur lors de la création du fichier Excel."); }
    } else if (pwd !== null) { alert("❌ Mot de passe incorrect."); }
}

// ==========================================
// GESTION DE L'ÉCRAN DE VEILLE (Inactivité)
// ==========================================
function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showScreensaver, IDLE_TIME);
}

document.addEventListener('mousemove', resetIdleTimer);
document.addEventListener('keypress', resetIdleTimer);
document.addEventListener('click', resetIdleTimer);
document.addEventListener('touchstart', resetIdleTimer);

async function showScreensaver() {
    const screen = document.getElementById('screensaver');
    screen.classList.remove('hidden');
    
    let scrollContent = document.getElementById('screensaver-scroll');
    scrollContent.innerHTML = 'Chargement du classement...';
    
    try {
        const snapshot = await get(ref(db, 'scores'));
        if (snapshot.exists()) {
            let data = Object.values(snapshot.val());
            data.sort((a, b) => b["Score Points"] - a["Score Points"]);
            
            let top10 = data.slice(0, 10); 
            let html = "";
            top10.forEach((p, i) => {
                let medaille = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `${i+1}.`));
                html += `<div>${medaille} ${p.Candidat} - ${p["Score Points"]} pts</div>`;
            });
            scrollContent.innerHTML = html + "<br><br><br>" + html;
        } else { scrollContent.innerHTML = "Soyez le premier à jouer !"; }
    } catch (error) { scrollContent.innerHTML = "Prêt à jouer !"; }
}

function hideScreensaver() {
    document.getElementById('screensaver').classList.add('hidden');
    resetIdleTimer();
}
resetIdleTimer();

// ==========================================
// SUPER ÉCOUTEUR CLAVIER (ENTRÉE, ECHAP, FLÈCHES)
// ==========================================
document.addEventListener('keydown', function(e) {
    const activeScreen = document.querySelector('.active-screen');
    const detailsModal = document.getElementById('details-modal');
    const pwdModal = document.getElementById('password-modal');
    const screensaver = document.getElementById('screensaver');

    // Quitte l'écran de veille dès qu'une touche est pressée
    if (!screensaver.classList.contains('hidden')) { hideScreensaver(); return; }

    // --- TOUCHE ECHAP (Annuler / Fermer) ---
    if (e.key === 'Escape') {
        if (detailsModal.classList.contains('show')) {
            closeModal();
        } else if (!pwdModal.classList.contains('show') && activeScreen) {
            // Echap annule le quiz si on est en train de jouer
            if (activeScreen.id === 'screen-game' || activeScreen.id === 'screen-intermediate') {
                cancelQuiz();
            }
        }
    }

    // --- TOUCHE ENTRÉE (Valider / Suivant) ---
    if (e.key === 'Enter') {
        if (activeScreen && activeScreen.id === 'screen-start' && document.activeElement.id === 'player-name') {
            startQuiz(); // Valide le prénom
        }
    }

    // --- FLÈCHES DIRECTIONNELLES (Voyager entre les réponses) ---
    if (activeScreen && activeScreen.id === 'screen-game') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault(); // Empêche la page de scroller
            
            // On récupère tous les boutons de réponse qui ne sont pas désactivés
            const btns = Array.from(document.querySelectorAll('#answers-container .answer-btn:not(:disabled)'));
            if (btns.length === 0) return;

            let currentIndex = btns.indexOf(document.activeElement); // Où est le curseur ?

            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                currentIndex = (currentIndex + 1) % btns.length; // Passe au suivant
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                currentIndex = (currentIndex - 1 + btns.length) % btns.length; // Passe au précédent
            }

            btns[currentIndex].focus(); // Déplace le curseur
        }
    }
});
