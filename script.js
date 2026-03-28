/* global DB, confetti, XLSX, Chart, jspdf, ChartDataLabels */

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

// ==========================================
// EXPOSITION DES FONCTIONS AU HTML
// ==========================================
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
window.generatePlayerPDF = generatePlayerPDF; 
window.generateAdminPDF = generateAdminPDF;
window.openQuestionEditor = openQuestionEditor; 
window.closeEditor = closeEditor;
window.addNewQuestion = addNewQuestion; 
window.editQuestion = editQuestion;
window.saveQuestion = saveQuestion; 
window.deleteQuestion = deleteQuestion;
window.resetQuestionsToDefault = resetQuestionsToDefault;

// ==========================================
// VARIABLES GLOBALES & CHARGEMENT
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

// Base de données dynamique
let dynamicDB = [];

// Graphiques Chart.js instanciés
let resultsChartInstance = null;
let modalChartInstance = null;
let currentViewingPlayerId = null; 

// Poids des difficultés (Crucial pour la justesse du Radar Chart)
const diffWeights = { "Com": 1, "STI": 2, "BU1": 3, "BU2": 4 };

// Chargement des questions depuis Firebase
async function loadQuestionsFromFirebase() {
    try {
        const snap = await get(ref(db, 'questions'));
        if (snap.exists()) {
            dynamicDB = snap.val();
        } else {
            await set(ref(db, 'questions'), DB);
            dynamicDB = DB;
        }
    } catch (error) {
        console.error("Erreur de chargement des questions, utilisation locale.", error);
        dynamicDB = DB; 
    }
}
loadQuestionsFromFirebase();

// ==========================================
// 🛡️ MODALE DU MOT DE PASSE
// ==========================================
function askPassword() {
    return new Promise((resolve) => {
        const modal = document.getElementById('password-modal');
        const input = document.getElementById('admin-pwd-input');
        const submitBtn = document.getElementById('submit-pwd-btn');
        const cancelBtn = document.getElementById('cancel-pwd-btn');
        
        input.value = ''; 
        input.type = 'password';
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

function sanitizeString(str) {
    return str.replace(/[&<>'"]/g, function(tag) {
        const charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

// ==========================================
// GESTION AUDIO & BACKGROUND
// ==========================================
const bgImages = ['appmeas.jpg', 'intérieur_iut.jpg', 'iut.jpg', 'kart.jpg', 'platine.jpg'];

function setRandomBackground() { 
    document.body.style.backgroundImage = `url('${bgImages[Math.floor(Math.random() * bgImages.length)]}')`; 
}

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playSound(type) {
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator(); 
    const gain = audioCtx.createGain();
    
    osc.connect(gain); 
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'correct') { 
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(880, now); 
        osc.frequency.setValueAtTime(1046, now + 0.1); 
        gain.gain.setValueAtTime(0.5, now); 
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); 
        osc.start(now); 
        osc.stop(now + 0.3); 
    } 
    else if (type === 'wrong' || type === 'timeout') { 
        osc.type = 'sawtooth'; 
        osc.frequency.setValueAtTime(150, now); 
        gain.gain.setValueAtTime(0.5, now); 
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4); 
        osc.start(now); 
        osc.stop(now + 0.4); 
    } 
    else if (type === 'fast-tick') { 
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(800, now); 
        gain.gain.setValueAtTime(0.1, now); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); 
        osc.start(now); 
        osc.stop(now + 0.05); 
    } 
    else if (type === 'tick') { 
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(400, now); 
        gain.gain.setValueAtTime(0.1, now); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05); 
        osc.start(now); 
        osc.stop(now + 0.05); 
    } 
    else if (type === 'drumroll') { 
        osc.type = 'sawtooth'; 
        osc.frequency.setValueAtTime(60, now); 
        const lfo = audioCtx.createOscillator(); 
        lfo.type = 'sine'; 
        lfo.frequency.value = 25; 
        const lfoGain = audioCtx.createGain(); 
        lfoGain.gain.value = 50; 
        lfo.connect(lfoGain); 
        lfoGain.connect(osc.frequency); 
        lfo.start(now); 
        lfo.stop(now + 3); 
        gain.gain.setValueAtTime(0, now); 
        gain.gain.linearRampToValueAtTime(0.5, now + 2); 
        gain.gain.linearRampToValueAtTime(0, now + 3); 
        osc.start(now); 
        osc.stop(now + 3); 
    }
}

// ==========================================
// LOGIQUE DE JEU & NAVIGATION UI
// ==========================================
function slideTo(screenId) {
    const active = document.querySelector('.active-screen');
    if (active && active.id === screenId) return; 
    
    if (active) { 
        active.classList.remove('active-screen'); 
        active.classList.add('slide-out-left'); 
        setTimeout(() => { 
            active.classList.add('hidden'); 
            active.classList.remove('slide-out-left'); 
        }, 400); 
    }
    
    const nextScreen = document.getElementById(screenId); 
    nextScreen.classList.remove('hidden'); 
    nextScreen.classList.add('slide-in-right'); 
    void nextScreen.offsetWidth; 
    nextScreen.classList.remove('slide-in-right'); 
    nextScreen.classList.add('active-screen');
}

function goToStart() {
    document.getElementById('player-name').value = ''; 
    setRandomBackground(); 
    resetIdleTimer(); 
    slideTo('screen-start');
}

function cancelQuiz() {
    if (confirm("⚠️ Es-tu sûr de vouloir annuler la partie en cours ?\n\nTa progression ne sera pas sauvegardée et n'apparaîtra pas dans le classement. Tu perdras tout.")) {
        clearInterval(timerInterval); 
        goToStart();
    }
}

function getRandom(arr, n) { 
    let shuffled = [...arr].sort(() => 0.5 - Math.random()); 
    return shuffled.slice(0, n); 
}

async function startQuiz() {
    let rawName = document.getElementById('player-name').value.trim();
    if (!rawName) return alert("Hé ! N'oublie pas de taper ton prénom !");
    
    let safeName = sanitizeString(rawName); 
    document.getElementById('player-name').blur(); 
    
    if (!audioCtx) audioCtx = new AudioContextClass(); 
    if (audioCtx.state === 'suspended') audioCtx.resume();

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
    } catch(e) { console.error(e); }

    playerName = safeName; 
    scoresPoints = {AII: 0, EME: 0, ESE: 0}; 
    scoresCount = {AII: 0, EME: 0, ESE: 0};
    scoreTotal = 0; 
    currentStreak = 0; 
    currentQIndex = 0; 
    playerSessionDetails = [];
    
    let selected = [];
    ['AII', 'EME', 'ESE'].forEach(cat => {
        let catQ = dynamicDB.filter(q => q.cat === cat);
        let qCom = getRandom(catQ.filter(q => q.diff === "Com"), 2);
        let qSTI = getRandom(catQ.filter(q => q.diff === "STI"), 3);
        let qBU1 = getRandom(catQ.filter(q => q.diff === "BU1"), 3);
        let qBU2 = getRandom(catQ.filter(q => q.diff === "BU2"), 2);
        selected = selected.concat(qCom, qSTI, qBU1, qBU2);
    });
    currentQuestions = selected.sort(() => 0.5 - Math.random());
    
    let progContainer = document.getElementById('progress-container'); 
    progContainer.innerHTML = '';
    
    for(let i=0; i<30; i++) { 
        progContainer.innerHTML += `<div class="progress-box" id="box-${i}"></div>`; 
    }
    
    document.getElementById('player-display').innerHTML = `👤 ${playerName} <span style="color:#f1c40f; margin-left:15px;" id="live-score">0 pts</span>`;
    slideTo('screen-game'); 
    loadQuestion();
}

function loadQuestion() {
    resetIdleTimer(); 
    setRandomBackground(); 
    clearInterval(timerInterval); 
    timeLeft = timeLimit;
    
    let timerBar = document.getElementById('timer-bar'); 
    timerBar.style.width = "100%"; 
    timerBar.style.backgroundColor = "#2ecc71"; 
    document.getElementById('timer-text').innerText = `⏱️ ${timeLeft}s`;

    let qData = currentQuestions[currentQIndex];
    document.getElementById('question-text').innerText = `Q${currentQIndex + 1}/${totalQuestions} : ${qData.q}`;
    
    let container = document.getElementById('answers-container'); 
    container.innerHTML = ''; 
    
    let options = qData.opt.map((text, index) => ({text, originalIndex: index}));
    options.sort(() => 0.5 - Math.random());
    
    options.forEach(opt => {
        let btn = document.createElement('button');
        btn.className = 'answer-btn'; 
        btn.innerText = opt.text; 
        btn.dataset.idx = opt.originalIndex; 
        btn.onclick = (e) => processAnswer(opt.originalIndex, qData.ans, e.target);
        container.appendChild(btn);
    });

    timerInterval = setInterval(() => {
        timeLeft--; 
        document.getElementById('timer-text').innerText = `⏱️ ${timeLeft}s`;
        
        if(timeLeft > 0 && timeLeft <= 10) playSound('fast-tick'); 
        else if (timeLeft > 10) playSound('tick');
        
        let pct = (timeLeft / timeLimit) * 100; 
        timerBar.style.width = pct + "%";
        if (pct < 50 && pct > 20) timerBar.style.backgroundColor = "#f1c40f"; 
        if (pct <= 20) timerBar.style.backgroundColor = "#e74c3c"; 

        if (timeLeft <= 0) processAnswer(-1, qData.ans, null); 
    }, 1000);
}

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
        scoresCount[qData.cat]++; 
        currentStreak++; 
        playSound('correct');
        if(clickedBtn) clickedBtn.classList.add('btn-correct'); 
        box.classList.add('prog-correct');
        
        pointsGained = Math.round((timeLeft / timeLimit) * 500) + 500;
        scoreTotal += pointsGained; 
        scoresPoints[qData.cat] += pointsGained;
    } else {
        currentStreak = 0; 
        playSound(isTimeout ? 'timeout' : 'wrong');
        if(clickedBtn) clickedBtn.classList.add('btn-wrong'); 
        box.classList.add('prog-wrong');
        allBtns.forEach(b => { 
            if (parseInt(b.dataset.idx) === correctIndex) b.classList.add('btn-correct'); 
        });
    }
    
    playerSessionDetails.push({ 
        cat: qData.cat, 
        diff: qData.diff, 
        q: qData.q, 
        isCorrect: isCorrect, 
        time: timeTaken, 
        points: pointsGained, 
        correctAnsText: qData.opt[qData.ans] 
    });

    document.getElementById('live-score').innerText = `${scoreTotal} pts`;
    setTimeout(() => { showIntermediateScreen(isCorrect, pointsGained, qData.trivia, isTimeout); }, 1500);
}

function showIntermediateScreen(isCorrect, points, trivia, isTimeout) {
    resetIdleTimer();
    
    let title = document.getElementById('intermediate-title'); 
    let ptsText = document.getElementById('intermediate-points'); 
    let streakText = document.getElementById('intermediate-streak');
    
    if (isTimeout) { 
        title.innerText = "⏱️ Temps écoulé !"; 
        title.style.color = "#f39c12"; 
        ptsText.innerText = "0 pts"; 
        ptsText.style.color = "#bdc3c7"; 
    } 
    else if (isCorrect) { 
        title.innerText = "Bonne réponse !"; 
        title.style.color = "#2ecc71"; 
        ptsText.innerText = `+ ${points} pts`; 
        ptsText.style.color = "white"; 
    } 
    else { 
        title.innerText = "Aïe, mauvaise réponse..."; 
        title.style.color = "#e74c3c"; 
        ptsText.innerText = "0 pts"; 
        ptsText.style.color = "#bdc3c7"; 
    }
    
    if (currentStreak >= 3) { 
        streakText.innerText = `Série en cours : ${currentStreak} bonnes réponses 🔥 !`; 
        streakText.style.display = "block"; 
    } else { 
        streakText.style.display = "none"; 
    }
    
    document.getElementById('trivia-text').innerText = trivia; 
    slideTo('screen-intermediate');
}

function goToNextQuestion() {
    currentQIndex++;
    
    if (currentQIndex < totalQuestions) { 
        slideTo('screen-game'); 
        setTimeout(() => loadQuestion(), 400); 
    } else { 
        slideTo('screen-suspense'); 
        playSound('drumroll'); 
        setTimeout(async () => { 
            await showResults(); 
            window.confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 10000 }); 
        }, 3000); 
    }
}

// ==========================================
// RÉSULTATS ET GRAPHIQUES RADAR
// ==========================================
const customCanvasBackgroundColor = {
    id: 'customCanvasBackgroundColor',
    beforeDraw: (chart, args, options) => {
        const {ctx} = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = options.color || '#1c2541'; 
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
    }
};

function calculateRadarData(sessionDetails) {
    let stats = { AII: {max:0, val:0}, EME: {max:0, val:0}, ESE: {max:0, val:0} };
    
    sessionDetails.forEach(q => {
        let w = diffWeights[q.diff] || 1; 
        if(stats[q.cat]) {
            stats[q.cat].max += w;
            if(q.isCorrect) stats[q.cat].val += w;
        }
    });
    
    let pAII = stats.AII.max ? Math.round((stats.AII.val / stats.AII.max) * 100) : 0;
    let pEME = stats.EME.max ? Math.round((stats.EME.val / stats.EME.max) * 100) : 0;
    let pESE = stats.ESE.max ? Math.round((stats.ESE.val / stats.ESE.max) * 100) : 0;
    
    return [pAII, pEME, pESE];
}

function drawRadarChart(canvasId, dataArray, chartInstanceToUpdate) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    if (chartInstanceToUpdate) { 
        chartInstanceToUpdate.destroy(); 
    }
    
    return new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['AII', 'EME', 'ESE'],
            datasets: [{
                label: 'Affinité (%)', 
                data: dataArray,
                backgroundColor: 'rgba(46, 204, 113, 0.4)', 
                borderColor: '#2ecc71',
                pointBackgroundColor: '#f1c40f', 
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff', 
                pointHoverBorderColor: '#f1c40f',
                borderWidth: 2
            }]
        },
        plugins: [customCanvasBackgroundColor, window.ChartDataLabels], 
        options: {
            animation: false,
            layout: { padding: 20 },
            scales: {
                r: { 
                    angleLines: { color: 'rgba(255, 255, 255, 0.2)' }, 
                    grid: { color: 'rgba(255, 255, 255, 0.2)' }, 
                    pointLabels: { color: '#fff', font: { size: 14, weight: 'bold' } }, 
                    ticks: { display: false, min: 0, max: 100, stepSize: 20 } 
                }
            },
            plugins: { 
                legend: { display: false },
                customCanvasBackgroundColor: { color: '#1c2541' },
                datalabels: {
                    color: '#1c2541',
                    backgroundColor: '#f1c40f',
                    borderRadius: 4,
                    padding: { top: 2, bottom: 2, left: 6, right: 6 },
                    font: { weight: 'bold', size: 13 },
                    formatter: function(value) { return value + '%'; },
                    anchor: 'center',
                    align: 'center'
                }
            }
        }
    });
}

async function showResults() {
    resetIdleTimer();
    
    let htmlScores = ""; 
    let bestCat = ""; 
    let maxScore = -1;
    
    for (let cat of ["AII", "EME", "ESE"]) {
        let count = scoresCount[cat]; 
        let pts = scoresPoints[cat];
        let color = count >= 6 ? "#2ecc71" : (count >= 4 ? "#f1c40f" : "#e74c3c");
        
        htmlScores += `Parcours ${cat} : <span style="color:${color}; font-weight:bold;">${count}/10</span> - <span style="color:#bdc3c7;">${pts} pts</span><br>`;
        
        if (count > maxScore) { 
            maxScore = count; 
            bestCat = cat; 
        } else if (count === maxScore) { 
            bestCat += " & " + cat; 
        }
    }
    
    document.getElementById('final-score').innerText = `Score Final : ${scoreTotal} pts`;
    document.getElementById('scores-display').innerHTML = htmlScores;
    document.getElementById('best-path').innerText = `👉 PARCOURS CONSEILLÉ : ${bestCat} 👈`;

    let radarData = calculateRadarData(playerSessionDetails);
    resultsChartInstance = drawRadarChart('results-chart', radarData, resultsChartInstance);

    let rank = 1;
    try {
        const snapshot = await get(ref(db, 'scores'));
        if (snapshot.exists()) {
            const scoresObj = snapshot.val();
            for (let key in scoresObj) { 
                if (scoresObj[key]["Score Points"] > scoreTotal) { 
                    rank++; 
                } 
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
}

function saveScoreFirebase(name, totalScore, profil, email) {
    push(ref(db, 'scores'), { 
        "Candidat": name, 
        "Score Points": totalScore, 
        "Profil": profil, 
        "ScoresCount": scoresCount, 
        "ScoresPoints": scoresPoints, 
        "SessionDetails": playerSessionDetails, 
        "keep": false, 
        "Email": email || "" 
    });
}

// ==========================================
// PODIUM ET MODALE DÉTAILS
// ==========================================
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
            for (let key in scoresObj) { 
                data.push({ id: key, ...scoresObj[key] }); 
            } 
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
        console.error(error); 
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#e74c3c;">Erreur réseau ❌</td></tr>'; 
    }
}

async function openModal(playerId) {
    try {
        const snapshot = await get(ref(db, 'scores')); 
        if(!snapshot.exists()) return;
        
        let scoresObj = snapshot.val(); 
        let allPlayers = Object.values(scoresObj);
        let player = { id: playerId, ...scoresObj[playerId] };
        
        currentViewingPlayerId = playerId;

        if(player.SessionDetails) {
            let radarData = calculateRadarData(player.SessionDetails);
            modalChartInstance = drawRadarChart('modal-chart', radarData, modalChartInstance);
        }

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

        document.getElementById('modal-header-content').innerHTML = `
            <h2 style="color:#f1c40f; margin-top:0; display:inline-block;">Analyse de : ${player.Candidat}</h2>
            <label class="keep-label"><input type="checkbox" onchange="toggleKeep('${player.id}', this.checked)" ${player.keep ? "checked" : ""}> 📌 Conserver</label>`;

        let tbody = document.getElementById('modal-table-body'); 
        tbody.innerHTML = '';
        
        if (player.SessionDetails) {
            player.SessionDetails.forEach(q => {
                let resIcon = q.isCorrect ? `<span class="correct-cell">✅</span>` : `<span class="incorrect-cell">❌</span>`;
                let successRate = (globalStats[q.q] && globalStats[q.q].asked > 0) ? Math.round((globalStats[q.q].correct / globalStats[q.q].asked) * 100) + "%" : "-";
                
                tbody.innerHTML += `<tr>
                    <td style="text-align:center;">${q.cat}</td>
                    <td style="text-align:center;">${q.diff || '-'}</td>
                    <td>${q.q}</td>
                    <td style="text-align:center;">${resIcon}</td>
                    <td style="text-align:center;">${q.points}</td>
                    <td style="text-align:center;">${successRate}</td>
                </tr>`;
            });
        }
        
        document.getElementById('details-modal').classList.add('show');
    } catch (error) { 
        console.error(error); 
    }
}

function closeModal() { 
    document.getElementById('details-modal').classList.remove('show'); 
}

async function toggleKeep(playerId, isChecked) { 
    try { await set(ref(db, 'scores/' + playerId + '/keep'), isChecked); } 
    catch (e) { console.error(e); } 
}

async function resetPodium() {
    let pwd = await askPassword();
    
    if (pwd === ADMIN_PASSWORD) {
        if (confirm("⚠️ Voulez-vous vraiment effacer TOUS les scores ? Action irréversible.")) {
            try { 
                await set(ref(db, 'scores'), null); 
                alert("🗑️ Base de données réinitialisée !"); 
                showPodium(); 
            } catch (error) { alert("Erreur lors de la réinitialisation."); }
        }
    } else if (pwd !== null) { 
        alert("❌ Mot de passe incorrect."); 
    }
}

// ==========================================
// EXPORT EXCEL
// ==========================================
async function downloadExcel() {
    let pwd = await askPassword();
    
    if (pwd === ADMIN_PASSWORD) {
        try {
            const snapshot = await get(ref(db, 'scores')); 
            if (!snapshot.exists()) return alert("Aucune donnée à exporter.");
            
            let dataPlayers = []; 
            let dataQuestions = []; 
            let dataDetails = []; 
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
                    "Conserver": p.keep ? "OUI" : "NON" 
                });
                
                if (p.SessionDetails) { 
                    p.SessionDetails.forEach((q, index) => { 
                        dataDetails.push({ 
                            "Candidat": p.Candidat, 
                            "Num": index + 1, 
                            "Catégorie": q.cat, 
                            "Diff": q.diff || '-', 
                            "Question": q.q, 
                            "Résultat": q.isCorrect ? "VRAI" : "FAUX", 
                            "Temps (s)": q.time, 
                            "Points": q.points 
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
                    "Catégorie": stat.cat, 
                    "Question": qText, 
                    "Fois Posée": stat.asked, 
                    "Bonnes Réponses": stat.correct, 
                    "Taux Réussite": successRate 
                });
            }
            
            dataQuestions.sort((a, b) => a.Catégorie.localeCompare(b.Catégorie));
            
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataPlayers), "Classement");
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataQuestions), "Stats Questions");
            if(dataDetails.length > 0) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(dataDetails), "Détail Brut");
            
            window.XLSX.writeFile(wb, "Resultats_GEII.xlsx");
        } catch (e) { 
            alert("Erreur lors de la création du fichier Excel."); 
        }
    } else if (pwd !== null) { 
        alert("❌ Mot de passe incorrect."); 
    }
}

// ==========================================
// EXPORT PDF AVEC CONCLUSION ET QR CODE
// ==========================================
function buildPDF(playerData, chartDataUrl) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let logoW = 60;
    let logoH = 18;
    
    const finalize = (logoUrl, qrUrl) => {
        // En-tête 
        if(logoUrl) { 
            let logoX = 105 - (logoW / 2); 
            doc.addImage(logoUrl, 'PNG', logoX, 10, logoW, logoH); 
        }
        
        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(20);
        doc.text("BILAN DE COMPÉTENCES GEII", 105, 38, {align: "center"});
        
        // Infos Joueur
        doc.setFontSize(14); 
        doc.setTextColor(0, 102, 204);
        doc.text(`Candidat : ${playerData.Candidat}`, 15, 50);
        
        doc.setTextColor(0, 0, 0); 
        doc.setFontSize(12);
        doc.text(`Score Final : ${playerData["Score Points"] || scoreTotal} pts`, 15, 58);
        
        let profil = playerData.Profil || document.getElementById('best-path').innerText.replace('👉 PARCOURS CONSEILLÉ : ', '').replace(' 👈', '');
        doc.text(`Profil Recommandé : ${profil}`, 15, 66);

        // Graphique Radar
        if(chartDataUrl) { 
            doc.addImage(chartDataUrl, 'PNG', 120, 40, 75, 75); 
        }

        // Tableau
        let tableData = [];
        if(playerData.SessionDetails) { 
            playerData.SessionDetails.forEach(q => { 
                tableData.push([ q.cat, q.q, q.isCorrect ? "VRAI" : "FAUX", q.correctAnsText || "N/A" ]); 
            }); 
        }
        
        doc.autoTable({
            startY: 120,
            head: [['Catégorie', 'Question Posée', 'Résultat', 'Bonne Réponse']],
            body: tableData,
            headStyles: { fillColor: [46, 204, 113] },
            styles: { fontSize: 9 },
            columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 90 }, 2: { cellWidth: 20 }, 3: { cellWidth: 50 } }
        });

        // --- CONCLUSION, LIEN ET QR CODE SANS EMOJI ---
        let finalY = doc.lastAutoTable.finalY + 15;

        if (finalY > 220) { 
            doc.addPage(); 
            finalY = 20; 
        }

        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(14); 
        doc.setTextColor(0, 102, 204);
        doc.text("Et maintenant ?", 15, finalY);

        doc.setFont("helvetica", "italic"); 
        doc.setFontSize(10); 
        doc.setTextColor(80, 80, 80);
        let conclusionText = "Attention : Ce bilan est issu d'un jeu récréatif scientifique. Il ne définit en rien ton avenir scolaire ou professionnel, mais souligne tes affinités actuelles. L'important est de choisir la voie qui te passionne !";
        doc.text(conclusionText, 15, finalY + 8, { maxWidth: 125, align: 'justify' });

        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(11); 
        doc.setTextColor(39, 174, 96);
        let rejouerText = "Envie de rejouer ou de relever le défi entre amis ?";
        doc.text(rejouerText, 15, finalY + 28);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(52, 152, 219); 
        let clickText = "Clique ici";
        doc.text(clickText, 15, finalY + 34);

        let textWidth = doc.getTextWidth(clickText);
        doc.setDrawColor(52, 152, 219);
        doc.setLineWidth(0.3);
        doc.line(15, finalY + 35, 15 + textWidth, finalY + 35);

        doc.link(15, finalY + 30, textWidth, 6, { url: 'https://5urio5.github.io/Jeu_GEII/' }); 

        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        
        // Texte final corrigé SANS EMOJI pour le PDF
        let suiteText = " pour y accéder, ou scanne le code QR";
        doc.text(suiteText, 15 + textWidth + 1, finalY + 34);

        // QR Code
        if(qrUrl) {
            doc.addImage(qrUrl, 'PNG', 155, finalY + 5, 35, 35); 
            doc.setFontSize(8); 
            doc.setTextColor(100, 100, 100); 
            doc.setFont("helvetica", "normal");
            doc.text("Scannez pour jouer !", 172.5, finalY + 43, { align: "center" });
        }

        doc.save(`Bilan_GEII_${playerData.Candidat}.pdf`);
    };

    let logoLoaded = false; let logoDataUrl = null;
    let qrLoaded = false; let qrDataUrl = null;

    const checkAllLoaded = () => { 
        if(logoLoaded && qrLoaded) finalize(logoDataUrl, qrDataUrl); 
    };

    const imgLogo = new Image(); 
    imgLogo.crossOrigin = "anonymous"; 
    imgLogo.src = "logo_noir.png";
    imgLogo.onload = () => {
        const canvas = document.createElement('canvas'); 
        canvas.width = imgLogo.naturalWidth; 
        canvas.height = imgLogo.naturalHeight;
        canvas.getContext('2d').drawImage(imgLogo, 0, 0); 
        logoDataUrl = canvas.toDataURL('image/png');
        
        let ratio = imgLogo.naturalWidth / imgLogo.naturalHeight;
        logoH = 18;
        logoW = 18 * ratio;
        
        logoLoaded = true; 
        checkAllLoaded();
    };
    imgLogo.onerror = () => { logoLoaded = true; checkAllLoaded(); };

    const imgQR = new Image(); 
    imgQR.src = "qr_code.png"; 
    imgQR.onload = () => {
        const canvas = document.createElement('canvas'); 
        canvas.width = imgQR.naturalWidth; 
        canvas.height = imgQR.naturalHeight;
        canvas.getContext('2d').drawImage(imgQR, 0, 0); 
        qrDataUrl = canvas.toDataURL('image/png');
        qrLoaded = true; 
        checkAllLoaded();
    };
    imgQR.onerror = () => { qrLoaded = true; checkAllLoaded(); };
}

function generatePlayerPDF() {
    if(!resultsChartInstance) return alert("Graphique non disponible.");
    let chartUrl = resultsChartInstance.toBase64Image();
    let pData = { Candidat: playerName, "Score Points": scoreTotal, SessionDetails: playerSessionDetails };
    buildPDF(pData, chartUrl);
}

async function generateAdminPDF() {
    let pwd = await askPassword();
    
    if (pwd === ADMIN_PASSWORD) {
        if(!currentViewingPlayerId || !modalChartInstance) return;
        try {
            const snapshot = await get(ref(db, `scores/${currentViewingPlayerId}`));
            if (snapshot.exists()) { 
                let pData = snapshot.val(); 
                let chartUrl = modalChartInstance.toBase64Image(); 
                buildPDF(pData, chartUrl); 
            }
        } catch(e) { 
            console.error(e); 
            alert("Erreur lors de la récupération du joueur."); 
        }
    } else if (pwd !== null) { 
        alert("❌ Mot de passe incorrect."); 
    }
}

// ==========================================
// EDITEUR DE QUESTIONS (ADMIN)
// ==========================================
async function openQuestionEditor() {
    let pwd = await askPassword();
    
    if (pwd === ADMIN_PASSWORD) { 
        renderEditorList(); 
        document.getElementById('editor-modal').classList.add('show'); 
    } else if (pwd !== null) { 
        alert("❌ Mot de passe incorrect."); 
    }
}

function closeEditor() { 
    document.getElementById('editor-modal').classList.remove('show'); 
    document.getElementById('editor-form-container').classList.add('hidden'); 
}

function renderEditorList() {
    let tbody = document.getElementById('editor-table-body'); 
    tbody.innerHTML = '';
    
    dynamicDB.forEach((q, i) => { 
        tbody.innerHTML += `<tr>
            <td style="text-align:center;">${i}</td>
            <td style="text-align:center;">${q.cat}</td>
            <td style="text-align:center;">${q.diff}</td>
            <td>${q.q}</td>
            <td style="text-align:center;">
                <button class="btn-details" style="background:#f39c12; margin-bottom:5px;" onclick="editQuestion(${i})">Éditer</button>
                <button class="btn-details" style="background:#e74c3c;" onclick="deleteQuestion(${i})">X</button>
            </td>
        </tr>`; 
    });
}

function addNewQuestion() { 
    dynamicDB.push({ 
        cat: "AII", 
        diff: "Com", 
        q: "Nouvelle Question", 
        opt: ["Rép 1", "Rép 2", "Rép 3", "Rép 4"], 
        ans: 0, 
        trivia: "Le saviez-vous ?" 
    }); 
    editQuestion(dynamicDB.length - 1); 
}

async function deleteQuestion(index) { 
    if(confirm("Supprimer cette question de la base de données ?")) { 
        dynamicDB.splice(index, 1); 
        try { 
            await set(ref(db, 'questions'), dynamicDB); 
            renderEditorList(); 
        } catch(e) { 
            alert("Erreur de sauvegarde Firebase"); 
        } 
    } 
}

async function resetQuestionsToDefault() { 
    if(confirm("⚠️ Écraser toutes les modifications et remettre la base de données d'origine ?")) { 
        dynamicDB = JSON.parse(JSON.stringify(DB)); 
        try { 
            await set(ref(db, 'questions'), dynamicDB); 
            renderEditorList(); 
            alert("Restauration réussie !"); 
        } catch(e) { 
            alert("Erreur de sauvegarde Firebase"); 
        } 
    } 
}

function editQuestion(index) {
    let q = dynamicDB[index];
    let formHtml = `
        <h3 style="margin-top:0; color:#2ecc71;">Modification (ID: ${index})</h3>
        <select id="edit-cat" class="editor-select">
            <option value="AII" ${q.cat==='AII'?'selected':''}>AII</option>
            <option value="EME" ${q.cat==='EME'?'selected':''}>EME</option>
            <option value="ESE" ${q.cat==='ESE'?'selected':''}>ESE</option>
        </select>
        <select id="edit-diff" class="editor-select">
            <option value="Com" ${q.diff==='Com'?'selected':''}>Com (1x)</option>
            <option value="STI" ${q.diff==='STI'?'selected':''}>STI (2x)</option>
            <option value="BU1" ${q.diff==='BU1'?'selected':''}>BU1 (3x)</option>
            <option value="BU2" ${q.diff==='BU2'?'selected':''}>BU2 (4x)</option>
        </select>
        <br>
        <input type="text" id="edit-q" class="editor-input" value="${q.q.replace(/"/g, '&quot;')}" placeholder="Texte question">
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label><input type="radio" name="edit-ans" value="0" ${q.ans===0?'checked':''}> <input type="text" id="edit-o0" class="editor-input" style="width:85%" value="${q.opt[0].replace(/"/g, '&quot;')}"></label>
            <label><input type="radio" name="edit-ans" value="1" ${q.ans===1?'checked':''}> <input type="text" id="edit-o1" class="editor-input" style="width:85%" value="${q.opt[1].replace(/"/g, '&quot;')}"></label>
            <label><input type="radio" name="edit-ans" value="2" ${q.ans===2?'checked':''}> <input type="text" id="edit-o2" class="editor-input" style="width:85%" value="${q.opt[2].replace(/"/g, '&quot;')}"></label>
            <label><input type="radio" name="edit-ans" value="3" ${q.ans===3?'checked':''}> <input type="text" id="edit-o3" class="editor-input" style="width:85%" value="${q.opt[3].replace(/"/g, '&quot;')}"></label>
        </div>
        
        <input type="text" id="edit-trivia" class="editor-input" value="${q.trivia.replace(/"/g, '&quot;')}" placeholder="Le Saviez-vous ?">
        
        <button class="main-btn" style="width:auto; padding:10px 20px;" onclick="saveQuestion(${index})">💾 Sauvegarder</button>
        <button class="secondary-btn" style="background:#e74c3c;" onclick="document.getElementById('editor-form-container').classList.add('hidden')">Annuler</button>
    `;
    
    let container = document.getElementById('editor-form-container'); 
    container.innerHTML = formHtml; 
    container.classList.remove('hidden'); 
    container.scrollIntoView({ behavior: "smooth" });
}

async function saveQuestion(index) {
    let ansRadios = document.getElementsByName('edit-ans'); 
    let ans = 0; 
    
    for(let i=0; i<ansRadios.length; i++) { 
        if(ansRadios[i].checked) ans = parseInt(ansRadios[i].value); 
    }
    
    dynamicDB[index] = { 
        cat: document.getElementById('edit-cat').value, 
        diff: document.getElementById('edit-diff').value, 
        q: document.getElementById('edit-q').value, 
        opt: [
            document.getElementById('edit-o0').value, 
            document.getElementById('edit-o1').value, 
            document.getElementById('edit-o2').value, 
            document.getElementById('edit-o3').value
        ], 
        ans: ans, 
        trivia: document.getElementById('edit-trivia').value 
    };
    
    try { 
        await set(ref(db, 'questions'), dynamicDB); 
        document.getElementById('editor-form-container').classList.add('hidden'); 
        renderEditorList(); 
        alert("✅ Question sauvegardée dans la base Firebase !"); 
    } catch(e) { 
        alert("Erreur lors de la sauvegarde Firebase."); 
    }
}

// ==========================================
// ECRAN DE VEILLE (INACTIVITÉ)
// ==========================================
function resetIdleTimer() { 
    clearTimeout(idleTimer); 
    idleTimer = setTimeout(showScreensaver, IDLE_TIME); 
}

document.addEventListener('mousemove', resetIdleTimer); 
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
        } else { 
            scrollContent.innerHTML = "Soyez le premier à jouer !"; 
        } 
    } catch (error) { 
        scrollContent.innerHTML = "Prêt à jouer !"; 
    }
}

function hideScreensaver() { 
    document.getElementById('screensaver').classList.add('hidden'); 
    resetIdleTimer(); 
}

resetIdleTimer();

// ==========================================
// SUPER ÉCOUTEUR CLAVIER (FOCUS DYNAMIQUE)
// ==========================================
document.addEventListener('keydown', function(e) {
    const activeScreen = document.querySelector('.active-screen'); 
    const detailsModal = document.getElementById('details-modal'); 
    const pwdModal = document.getElementById('password-modal'); 
    const editorModal = document.getElementById('editor-modal');
    const screensaver = document.getElementById('screensaver');
    
    // Sortir de l'écran de veille dès qu'on touche le clavier
    if (!screensaver.classList.contains('hidden')) { 
        hideScreensaver(); 
        return; 
    }
    
    // TOUCHE ECHAP (Fermer, Annuler)
    if (e.key === 'Escape') { 
        if (detailsModal.classList.contains('show')) { 
            closeModal(); 
        } else if (editorModal.classList.contains('show')) { 
            closeEditor(); 
        } else if (activeScreen && (activeScreen.id === 'screen-game' || activeScreen.id === 'screen-intermediate')) { 
            cancelQuiz(); 
        } 
    }
    
    // TOUCHE ENTRÉE (Actions contextuelles de confort)
    if (e.key === 'Enter') { 
        if (activeScreen) { 
            if (activeScreen.id === 'screen-start' && document.activeElement.id === 'player-name') { 
                startQuiz(); 
            } else if (activeScreen.id === 'screen-intermediate') { 
                goToNextQuestion(); 
            } else if (activeScreen.id === 'screen-results') { 
                goToStart(); 
            } 
        } 
    }
    
    // FLÈCHES DU CLAVIER (Navigation dans les réponses)
    if (activeScreen && activeScreen.id === 'screen-game') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault(); // Bloque le scrolling de la page
            
            const btns = Array.from(document.querySelectorAll('#answers-container .answer-btn:not(:disabled)')); 
            if (btns.length === 0) return;
            
            let currentIndex = btns.indexOf(document.activeElement);
            
            if (currentIndex === -1) { 
                // Aucune case n'est encore sélectionnée, on encadre la première
                btns[0].focus(); 
            } else { 
                // Navigation circulaire entre les options
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { 
                    currentIndex = (currentIndex + 1) % btns.length; 
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { 
                    currentIndex = (currentIndex - 1 + btns.length) % btns.length; 
                } 
                btns[currentIndex].focus(); 
            }
        }
    }
});