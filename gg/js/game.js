// =============================================================
// LIGHTNING JO BACCARAT — game.js
// All game logic, audio, RNG, and persistence in one place.
// Rules implemented per Evolution Gaming Lightning Baccarat spec.
// =============================================================

// =============================================================
// SECTION 1 — LOBBY CONTROLLER
// =============================================================

/**
 * Dismisses the game lobby overlay and starts the session.
 * Bound to the "PLAY NOW" button on the Baccarat card in the lobby.
 */
function enterGame() {
    const overlay = document.getElementById('lobby-overlay');
    overlay.classList.add('hide');
    overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
}


// =============================================================
// SECTION 2 — CRYPTO RNG MODULE
//
// Casino-grade randomness using the Web Crypto API.
// Replaces Math.random() for all game-critical decisions.
// Standards: matches UKGC / MGA technical requirements for
// RNG-based online casino games.
// =============================================================

/**
 * Returns a cryptographically secure float in [0, 1).
 * Uses a 32-bit unsigned integer from crypto.getRandomValues()
 * to eliminate the predictability of Math.random().
 * @returns {number} Secure float in [0, 1)
 */
function secureRandom() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / (0xFFFFFFFF + 1);
}

/**
 * Returns a cryptographically secure integer in [min, max] inclusive.
 * @param {number} min - Inclusive lower bound
 * @param {number} max - Inclusive upper bound
 * @returns {number} Secure integer
 */
function secureRandomInt(min, max) {
    return Math.floor(secureRandom() * (max - min + 1)) + min;
}

/**
 * Selects a value from a weighted probability table using crypto RNG.
 * @param {Array<{value: *, weight: number}>} table
 * @returns {*} Randomly selected value
 */
function weightedRandom(table) {
    const total = table.reduce((sum, e) => sum + e.weight, 0);
    let roll = secureRandom() * total;
    for (const entry of table) {
        roll -= entry.weight;
        if (roll <= 0) return entry.value;
    }
    return table[table.length - 1].value;
}

/**
 * Lightning multiplier weight table.
 *
 * Per Evolution Gaming official spec (confirmed by lightning-baccarat.ca):
 * "The five multiplier options have equal probability."
 * Each of {2x, 3x, 4x, 5x, 8x} has a 20% chance per Lightning Card.
 */
const LIGHTNING_MULT_TABLE = [
    { value: 2, weight: 20 },
    { value: 3, weight: 20 },
    { value: 4, weight: 20 },
    { value: 5, weight: 20 },
    { value: 8, weight: 20 },
];


// =============================================================
// SECTION 3 — GAME STATE
// =============================================================

/** Number of real cards dealt from the current 8-deck shoe. */
let dealtCardsCount = 0;

let balance        = 1e9,
    activeChip     = 25e3,
    bets           = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 },
    totalBetAmount = 0,
    isPlaying      = false,
    isReshuffling  = false,
    currentLightning = [],
    gameHistory    = [];

/**
 * Plain-text game log — one entry per completed round.
 * Persisted in localStorage so it survives page reloads.
 * Downloaded via downloadLog().
 * @type {string[]}
 */
let gameLog = [];

/** Running round counter (never resets between sessions). */
let roundCounter = 0;

/** Chip denominations available in the UI. */
const chipValues = [25e3, 1e5, 5e5, 1e6, 5e6, 1e7];

/** Map of denomination to button element ID. */
const idMap = {
    25e3: 'chip-25k',
    1e5:  'chip-100k',
    5e5:  'chip-500k',
    1e6:  'chip-1m',
    5e6:  'chip-5m',
    1e7:  'chip-10m',
};

// Big Road state
let bigRoadMatrix = Array(28).fill(null).map(() => Array(6).fill(null));
let currCol    = 0;
let currRow    = 0;
let lastWinner = null;
let stats      = { total: 0, p: 0, b: 0, t: 0 };

/** All four card suits. */
const suits = ['♠', '♥', '♦', '♣'];

/**
 * Baccarat card definitions.
 * Face cards (10, J, Q, K) count as 0; Ace counts as 1.
 */
const values = [
    { n: 'A',  v: 1 }, { n: '2', v: 2 }, { n: '3', v: 3 },
    { n: '4',  v: 4 }, { n: '5', v: 5 }, { n: '6', v: 6 },
    { n: '7',  v: 7 }, { n: '8', v: 8 }, { n: '9', v: 9 },
    { n: '10', v: 0 }, { n: 'J', v: 0 }, { n: 'Q', v: 0 },
    { n: 'K',  v: 0 },
];

/** Promisified setTimeout. */
const sleep = ms => new Promise(res => setTimeout(res, ms));

/** Formats a number as Indonesian Rupiah, e.g. "Rp 1.000.000". */
const fmtIdr  = n => 'Rp ' + Math.floor(Math.abs(n)).toLocaleString('id-ID');

/** Formats a chip value to a compact label, e.g. "5M", "100K". */
const fmtChip = n =>
    n >= 1e6 ? +(n / 1e6).toFixed(2) + 'M' :
    n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' :
    Math.floor(n);

/** Formats a card for the plain-text log, e.g. "9♠(9)" or "K♣(0)". */
const fmtCard = c => `${c.n}${c.suit}(${c.v})`;


// =============================================================
// SECTION 3b — GAME LOG
//
// A human-readable .txt log of every completed round.
// Stored in localStorage, downloadable on demand via the LOG button.
// =============================================================

/**
 * Builds a plain-text entry for one completed round and pushes it
 * onto the gameLog array.  Called immediately after every deal.
 *
 * Entry format:
 *   [Round #N] date | time
 *   Lightning  : K♣(0)×5  8♣(0)×5
 *   Player     : 9♠(9)  7♦(7)  [3rd card if drawn]  → Score: 6  Mult: ×N
 *   Banker     : 6♣(6)  6♣(6)  [3rd card if drawn]  → Score: 7  Mult: ×N
 *   Winner     : BANKER  (or PLAYER / TIE)
 *   Bets       : P=Rp…  B=Rp…  T=Rp…  PP=Rp…  BP=Rp…  | Total Rp…
 *   Payout     : Rp…  Net: +Rp… / -Rp…
 *   ─────────────────────────────────────────────
 *
 * @param {object} p - Round data
 * @param {object} p.pCard1 p.pCard2 p.pCard3  - Player cards (pCard3 may be null)
 * @param {object} p.bCard1 p.bCard2 p.bCard3  - Banker cards (bCard3 may be null)
 * @param {Array}  p.lightningCards             - Lightning cards with .mult
 * @param {number} p.pScore                     - Final player score
 * @param {number} p.bScore                     - Final banker score
 * @param {number} p.pMultTotal                 - Player hand multiplier
 * @param {number} p.bMultTotal                 - Banker hand multiplier
 * @param {string} p.winner                     - 'P' | 'B' | 'T'
 * @param {object} p.betsSnapshot               - Copy of bets before clearing
 * @param {number} p.baseBet                    - Total wagered this round
 * @param {number} p.payout                     - Total returned to player
 * @param {string} p.dateStr                    - Formatted date string
 * @param {string} p.timeStr                    - Formatted time string
 */
function appendGameLog(p) {
    roundCounter++;

    // Lightning cards line
    const lLine = p.lightningCards.length
        ? p.lightningCards.map(c => `${fmtCard(c)}×${c.mult}`).join('  ')
        : '(none)';

    // Card lines with optional third card
    const pCards = [p.pCard1, p.pCard2, p.pCard3].filter(Boolean).map(fmtCard).join('  ');
    const bCards = [p.bCard1, p.bCard2, p.bCard3].filter(Boolean).map(fmtCard).join('  ');

    const winnerLabel = p.winner === 'P' ? 'PLAYER' : p.winner === 'B' ? 'BANKER' : 'TIE';

    const net    = p.payout - p.baseBet;
    const netStr = net >= 0 ? `+${fmtIdr(net)}` : `-${fmtIdr(Math.abs(net))}`;

    const bs = p.betsSnapshot;
    const betLine = bs.player || bs.banker || bs.tie || bs.playerPair || bs.bankerPair
        ? `P=${fmtIdr(bs.player)}  B=${fmtIdr(bs.banker)}  T=${fmtIdr(bs.tie)}  PP=${fmtIdr(bs.playerPair)}  BP=${fmtIdr(bs.bankerPair)}  | Total: ${fmtIdr(p.baseBet)}`
        : 'No bets placed';

    const entry = [
        `[Round #${roundCounter}] ${p.dateStr} | ${p.timeStr}`,
        `Lightning  : ${lLine}`,
        `Player     : ${pCards}  →  Score: ${p.pScore}  Mult: ×${p.pMultTotal}`,
        `Banker     : ${bCards}  →  Score: ${p.bScore}  Mult: ×${p.bMultTotal}`,
        `Winner     : ${winnerLabel}`,
        `Bets       : ${betLine}`,
        `Payout     : ${fmtIdr(p.payout)}  Net: ${netStr}`,
        '─'.repeat(52),
    ].join('\n');

    gameLog.push(entry);

    // Persist the updated log to localStorage
    try {
        localStorage.setItem(getGameLogKey(), JSON.stringify({ counter: roundCounter, entries: gameLog }));
    } catch (e) {
        // Storage quota exceeded — trim oldest 20 entries and retry
        gameLog.splice(0, 20);
        localStorage.setItem(getGameLogKey(), JSON.stringify({ counter: roundCounter, entries: gameLog }));
    }
}

/**
 * Triggers a browser download of the complete session log as a .txt file.
 * File name includes a timestamp so multiple sessions don't overwrite each other.
 * Called by the LOG button in the UI.
 */
function downloadLog() {
    if (gameLog.length === 0) {
        alert('No rounds played yet — the log is empty.');
        return;
    }
    playChipSound();
    const ts      = new Date().toLocaleString('id-ID').replace(/[/:]/g, '.').replace(/,/g, '');
    const header  = [
        '='.repeat(52),
        ' LIGHTNING JO BACCARAT — SESSION LOG',
        '='.repeat(52),
        `Generated : ${new Date().toLocaleString('id-ID')}`,
        `Rounds    : ${roundCounter}`,
        '',
    ].join('\n');
    const blob = new Blob([header + gameLog.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lightning-jo-log-${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// =============================================================
// SECTION 4 — AUDIO ENGINE
//
// All game sounds are synthesised via the Web Audio API.
// No external audio files are required.
//
// Note: Math.random() is intentionally used inside noise buffers —
// these produce perceptual audio texture, not game outcomes.
// All game-critical randomness uses secureRandom() (Section 2).
// =============================================================

let audioCtx = null;

/**
 * Lazily initialises the shared AudioContext on first user gesture.
 * @returns {boolean} True if context is ready.
 */
function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { return false; }
    }
    return true;
}

/**
 * Builds a short synthetic convolution reverb tail using a
 * decaying-noise impulse response.
 * Used to add spatial depth to fanfares and win sounds.
 *
 * @param {number} durationSec - Impulse response length in seconds
 * @param {number} [wet=0.25]  - Wet mix output gain
 * @returns {{ input: ConvolverNode, output: GainNode }}
 */
function createReverb(durationSec, wet = 0.25) {
    const convolver = audioCtx.createConvolver();
    const len       = Math.floor(audioCtx.sampleRate * durationSec);
    const buf       = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    convolver.buffer = buf;
    const gain = audioCtx.createGain();
    gain.gain.value = wet;
    convolver.connect(gain);
    return { input: convolver, output: gain };
}

/**
 * Crisp metallic casino-chip click.
 * Two oscillators: a triangle body + a high-frequency sine shimmer,
 * summed through a dynamics compressor for consistent loudness.
 */
function playChipSound() {
    if (!initAudio()) return;
    const now  = audioCtx.currentTime;
    const comp = audioCtx.createDynamicsCompressor();
    comp.connect(audioCtx.destination);

    // Primary click body
    const osc1 = audioCtx.createOscillator();
    const g1   = audioCtx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(2400, now);
    osc1.frequency.exponentialRampToValueAtTime(900, now + 0.07);
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.18, now + 0.004);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc1.connect(g1); g1.connect(comp);
    osc1.start(now); osc1.stop(now + 0.10);

    // Metallic shimmer overtone
    const osc2 = audioCtx.createOscillator();
    const g2   = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(7200, now);
    osc2.frequency.exponentialRampToValueAtTime(3600, now + 0.04);
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.07, now + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc2.connect(g2); g2.connect(comp);
    osc2.start(now); osc2.stop(now + 0.06);
}

/**
 * Smooth descending sweep played when all bets are cleared.
 * A convolution reverb adds a short room tail.
 */
function playClearSound() {
    if (!initAudio()) return;
    const now    = audioCtx.currentTime;
    const reverb = createReverb(0.4, 0.15);
    reverb.output.connect(audioCtx.destination);

    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.30);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(reverb.input);
    g.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.32);
}

/**
 * Card deal: high-frequency noise whoosh + low-frequency thwack impact.
 *
 * Layer 1 — Noise whoosh: band-pass filtered noise sweeps downward,
 *            mimicking a card sliding across felt.
 * Layer 2 — Impact thwack: sine burst at the landing moment.
 */
function playCardSound() {
    if (!initAudio()) return;
    const now = audioCtx.currentTime;
    const sr  = audioCtx.sampleRate;

    // Noise whoosh with envelope
    const len = Math.floor(sr * 0.14);
    const buf = audioCtx.createBuffer(1, len, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const env = i < len * 0.15
            ? (i / (len * 0.15))
            : Math.pow(1 - (i - len * 0.15) / (len * 0.85), 1.5);
        d[i] = (Math.random() * 2 - 1) * env * 0.45;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const hpf = audioCtx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.setValueAtTime(2500, now);
    hpf.frequency.exponentialRampToValueAtTime(600, now + 0.10);
    const wg = audioCtx.createGain();
    wg.gain.value = 0.12;
    src.connect(hpf); hpf.connect(wg); wg.connect(audioCtx.destination);
    src.start(now);

    // Impact thwack
    const imp = audioCtx.createOscillator();
    const ig  = audioCtx.createGain();
    imp.type = 'sine';
    imp.frequency.setValueAtTime(200, now + 0.06);
    imp.frequency.exponentialRampToValueAtTime(60, now + 0.13);
    ig.gain.setValueAtTime(0, now + 0.06);
    ig.gain.linearRampToValueAtTime(0.22, now + 0.065);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    imp.connect(ig); ig.connect(audioCtx.destination);
    imp.start(now + 0.06); imp.stop(now + 0.16);
}

/**
 * Electric lightning strike — four simultaneous synthesis layers:
 *
 * 1. White-noise crackle burst  — simulates the arc discharge
 * 2. Descending square-wave zap — the electrical bolt tone
 * 3. Sawtooth sub-bass rumble   — low-pass filtered thunder
 * 4. Staggered sine sparkle tail— three harmonics fading out
 */
function playLightningSound() {
    if (!initAudio()) return;
    const now = audioCtx.currentTime;
    const sr  = audioCtx.sampleRate;

    // 1. Crackle burst
    const cLen = Math.floor(sr * 0.10);
    const cBuf = audioCtx.createBuffer(1, cLen, sr);
    const cd   = cBuf.getChannelData(0);
    for (let i = 0; i < cLen; i++) cd[i] = Math.random() * 2 - 1;
    const crackle = audioCtx.createBufferSource();
    crackle.buffer = cBuf;
    const cbf = audioCtx.createBiquadFilter();
    cbf.type = 'bandpass'; cbf.frequency.value = 5000; cbf.Q.value = 0.4;
    const cg = audioCtx.createGain();
    cg.gain.setValueAtTime(0.28, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    crackle.connect(cbf); cbf.connect(cg); cg.connect(audioCtx.destination);
    crackle.start(now);

    // 2. Descending zap
    const zap = audioCtx.createOscillator();
    const zg  = audioCtx.createGain();
    zap.type  = 'square';
    zap.frequency.setValueAtTime(3500, now);
    zap.frequency.exponentialRampToValueAtTime(400, now + 0.15);
    zg.gain.setValueAtTime(0.09, now);
    zg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    zap.connect(zg); zg.connect(audioCtx.destination);
    zap.start(now); zap.stop(now + 0.16);

    // 3. Thunder sub-rumble
    const thunder = audioCtx.createOscillator();
    const tg      = audioCtx.createGain();
    const tf      = audioCtx.createBiquadFilter();
    thunder.type  = 'sawtooth';
    thunder.frequency.setValueAtTime(90, now + 0.03);
    thunder.frequency.exponentialRampToValueAtTime(28, now + 0.65);
    tf.type = 'lowpass'; tf.frequency.value = 250;
    tg.gain.setValueAtTime(0, now + 0.03);
    tg.gain.linearRampToValueAtTime(0.20, now + 0.07);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    thunder.connect(tf); tf.connect(tg); tg.connect(audioCtx.destination);
    thunder.start(now + 0.03); thunder.stop(now + 0.68);

    // 4. Sparkle harmonic tail
    [2800, 4200, 5600].forEach((freq, i) => {
        const sp = audioCtx.createOscillator();
        const sg = audioCtx.createGain();
        sp.type = 'sine'; sp.frequency.value = freq;
        const t = now + i * 0.025;
        sg.gain.setValueAtTime(0, t);
        sg.gain.linearRampToValueAtTime(0.04, t + 0.01);
        sg.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        sp.connect(sg); sg.connect(audioCtx.destination);
        sp.start(t); sp.stop(t + 0.22);
    });
}

/**
 * Player-win fanfare — bright ascending four-note chord (C5–E5–G5–C6).
 * Triangle oscillators with harmonic overtones and convolution reverb.
 */
function playPlayerWinSound() {
    if (!initAudio()) return;
    const now    = audioCtx.currentTime;
    const reverb = createReverb(1.0, 0.3);
    reverb.output.connect(audioCtx.destination);

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
        const osc  = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const g    = audioCtx.createGain();
        const g2   = audioCtx.createGain();
        const t    = now + i * 0.13;

        osc.type = 'triangle'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.17, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.04, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        osc.connect(g); g.connect(reverb.input); g.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + 1.2);

        osc2.type = 'sine'; osc2.frequency.value = freq * 2;
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.05, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc2.connect(g2); g2.connect(audioCtx.destination);
        osc2.start(t); osc2.stop(t + 0.5);
    });
}

/**
 * Banker-win fanfare — deeper brass-like chord one octave lower (C4–E4–G4–C5).
 * Sawtooth oscillators passed through a low-pass filter for warmth.
 */
function playBankerWinSound() {
    if (!initAudio()) return;
    const now    = audioCtx.currentTime;
    const reverb = createReverb(0.9, 0.28);
    reverb.output.connect(audioCtx.destination);

    const notes = [261.63, 329.63, 392.00, 523.25]; // C4 E4 G4 C5
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const lpf = audioCtx.createBiquadFilter();
        const g   = audioCtx.createGain();
        const t   = now + i * 0.11;

        osc.type = 'sawtooth'; osc.frequency.value = freq;
        lpf.type = 'lowpass'; lpf.frequency.value = 1800;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.14, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.04, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        osc.connect(lpf); lpf.connect(g);
        g.connect(reverb.input); g.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + 1.1);
    });
}

/**
 * Tie result — suspended open-fifth chord (G4–B4–D5).
 * Pure sine waves with long decay and reverb suggest a neutral outcome.
 */
function playTieSound() {
    if (!initAudio()) return;
    const now    = audioCtx.currentTime;
    const reverb = createReverb(1.2, 0.35);
    reverb.output.connect(audioCtx.destination);

    [392.00, 493.88, 587.33].forEach((freq, i) => { // G4 B4 D5
        const osc = audioCtx.createOscillator();
        const g   = audioCtx.createGain();
        const t   = now + i * 0.06;
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        osc.connect(g); g.connect(reverb.input); g.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + 1.3);
    });
}

/**
 * Countdown tick — a soft sine blip played each second of the
 * between-round countdown to give a natural sense of passing time.
 */
function playCountdownTick() {
    if (!initAudio()) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.055, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.07);
}

/**
 * Card-shuffle burst — broadband noise with a bell-shaped amplitude
 * envelope, played periodically during the shoe-reshuffle animation.
 */
function playShuffleSound() {
    if (!initAudio()) return;
    const now = audioCtx.currentTime;
    const sr  = audioCtx.sampleRate;

    const len = Math.floor(sr * 0.18);
    const buf = audioCtx.createBuffer(1, len, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len) * 0.35;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const bpf = audioCtx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 1800; bpf.Q.value = 0.8;
    const g = audioCtx.createGain(); g.gain.value = 0.18;
    src.connect(bpf); bpf.connect(g); g.connect(audioCtx.destination);
    src.start(now);
}


// =============================================================
// SECTION 5 — BETTING ENGINE
// =============================================================

/**
 * Returns a chip-token background colour keyed to denomination.
 * @param {number} value - Chip face value in IDR
 * @returns {string} CSS hex colour
 */
function getChipBgColor(value) {
    if (value >= 1e7) return '#b45309';
    if (value >= 5e6) return '#7e22ce';
    if (value >= 1e6) return '#000000';
    if (value >= 5e5) return '#15803d';
    if (value >= 1e5) return '#b91c1c';
    return '#333333';
}

/**
 * Credits a random amount (1–10 million IDR) to the player balance.
 * Uses secureRandomInt() so the amount is unpredictable.
 * Blocked during shoe reshuffles.
 */
function topUpBalance() {
    if (isReshuffling) return;
    playChipSound();
    balance += secureRandomInt(1, 10) * 1_000_000;
    saveGameData();
    updateUI();
}

/**
 * Enables or disables chip buttons based on the current balance and
 * game state. Auto-downgrades activeChip if balance falls below 1.2×
 * the denomination (the 20% Lightning Fee is factored in here).
 */
function updateChips() {
    let highestAffordable = 0;
    const blocked = isPlaying || isReshuffling;

    chipValues.forEach(val => {
        const btn      = document.getElementById(idMap[val]);
        const canAfford = !blocked && balance >= 1.2 * val;
        btn.disabled      = !canAfford;
        btn.style.opacity = canAfford ? '1' : '0.3';
        if (!canAfford) btn.classList.remove('active');
        else highestAffordable = Math.max(highestAffordable, val);
    });

    const allInBtn      = document.getElementById('chip-allin');
    const canAllIn      = !blocked && balance > 0;
    allInBtn.disabled      = !canAllIn;
    allInBtn.style.opacity = canAllIn ? '1' : '0.3';
    if (!canAllIn) allInBtn.classList.remove('active');

    if (blocked) {
        document.querySelectorAll('.sel-chip').forEach(b => b.classList.remove('active'));
    } else {
        if (activeChip !== 'ALL' && activeChip > 0 && balance < 1.2 * activeChip) {
            if (highestAffordable > 0) selectChip(highestAffordable);
            else {
                activeChip = 0;
                document.querySelectorAll('.sel-chip').forEach(b => b.classList.remove('active'));
            }
        } else if (activeChip === 'ALL' && balance <= 0) {
            activeChip = 0;
            document.querySelectorAll('.sel-chip').forEach(b => b.classList.remove('active'));
        } else if (activeChip > 0 || activeChip === 'ALL') {
            document.querySelectorAll('.sel-chip').forEach(b => b.classList.remove('active'));
            const btnId = activeChip === 'ALL' ? 'chip-allin' : idMap[activeChip];
            document.getElementById(btnId).classList.add('active');
        }
    }

    const addBtn  = document.getElementById('add-bal-btn');
    const histBtn = document.getElementById('history-btn');
    const logBtn  = document.getElementById('log-btn');
    const clrBtn  = document.getElementById('clear-btn');
    if (addBtn)  { addBtn.disabled  = isReshuffling; addBtn.style.opacity  = isReshuffling ? '0.5' : '1'; }
    if (histBtn) { histBtn.disabled = isReshuffling; histBtn.style.opacity = isReshuffling ? '0.5' : '1'; }
    if (logBtn)  { logBtn.disabled  = isReshuffling; logBtn.style.opacity  = isReshuffling ? '0.5' : '1'; }
    if (clrBtn)  { clrBtn.disabled  = blocked;       clrBtn.style.opacity  = blocked       ? '0.5' : '1'; }

    if (balance < 3e4 && !isPlaying && totalBetAmount === 0)
        setStatus('INSUFFICIENT BALANCE', '#b91c1c', 'white');
    else if (!isPlaying && totalBetAmount === 0)
        setStatus('PLACE YOUR BETS', '#1f8f45', 'white');
}

/**
 * Sets the active chip denomination and highlights its button.
 * @param {number|"ALL"} chip - Denomination or "ALL" for all-in mode
 */
function selectChip(chip) {
    if (isPlaying || isReshuffling) return;
    if (chip !== 'ALL' && balance < 1.2 * chip) return;
    if (chip === 'ALL' && balance <= 0) return;
    playChipSound();
    activeChip = chip;
    document.querySelectorAll('.sel-chip').forEach(b => b.classList.remove('active'));
    document.getElementById(chip === 'ALL' ? 'chip-allin' : idMap[chip]).classList.add('active');
}

/**
 * Routes mousedown events on a bet zone.
 * Left-click  (button 0) → place chip.
 * Right-click (button 2) → remove chip (undo).
 *
 * @param {MouseEvent} event
 * @param {string}     zone - Bet zone key
 */
function handleBetClick(event, zone) {
    event.preventDefault();
    if (event.button === 0) placeBet(zone);
    else if (event.button === 2) undoBet(zone);
}

/**
 * Places the selected chip on the given zone.
 *
 * Cost structure (20% Lightning Fee baked in):
 *   balance deducted  = 1.2 × chip   (chip + 20% fee)
 *   bets[zone]       += chip          (base stake for payout calculation)
 *
 * @param {string} zone - Target bet zone key
 */
function placeBet(zone) {
    if (isPlaying || activeChip === 0 || isReshuffling) return;
    let cost, stake;
    if (activeChip === 'ALL') {
        cost  = balance;
        stake = Math.floor(cost / 1.2);
    } else {
        cost  = 1.2 * activeChip;
        stake = activeChip;
    }
    if (balance >= cost && cost > 0) {
        playChipSound();
        balance       -= cost;
        bets[zone]    += stake;
        totalBetAmount += cost;
        updateUI();
    }
}

/**
 * Removes the last chip from a zone and refunds balance.
 * Refund reverses the 1.2× cost: refund = deducted_stake × 1.2.
 *
 * @param {string} zone - Bet zone key to undo
 */
function undoBet(zone) {
    if (isPlaying || bets[zone] <= 0 || activeChip === 0 || isReshuffling) return;
    let deduct, refund;
    if (activeChip === 'ALL') {
        deduct = bets[zone];
        refund = deduct * 1.2;
    } else {
        deduct = Math.min(bets[zone], activeChip);
        refund = deduct * 1.2;
    }
    if (deduct > 0) {
        playChipSound();
        balance       += refund;
        bets[zone]    -= deduct;
        totalBetAmount -= refund;
        updateUI();
    }
}

/** Refunds all active bets and resets the bet state. */
function clearBets() {
    if (isPlaying || isReshuffling) return;
    if (totalBetAmount > 0) playClearSound();
    balance        += totalBetAmount;
    bets            = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 };
    totalBetAmount  = 0;
    saveGameData();
    updateUI();
}


// =============================================================
// SECTION 6 — UI RENDERING
// =============================================================

/** Refreshes balance/bet labels and chip button states. */
function updateUI() {
    document.getElementById('ui-balance').innerText  = fmtIdr(balance);
    document.getElementById('ui-totalbet').innerText = fmtIdr(totalBetAmount);
    updateChips();
    ['player', 'banker', 'tie', 'playerPair', 'bankerPair'].forEach(zone => {
        const el = document.getElementById(`bet-${zone}`);
        if (bets[zone] > 0) {
            const bg = getChipBgColor(bets[zone]);
            el.innerHTML = `<div class="chip-token" style="background:${bg};color:white">${fmtChip(bets[zone])}</div>`;
        } else {
            el.innerHTML = '';
        }
    });
}

/**
 * Updates the status bar text and colours.
 * @param {string} text  - Status message
 * @param {string} [bg]  - Background CSS colour
 * @param {string} [col] - Text CSS colour
 */
function setStatus(text, bg = '#00ff00', col = 'black') {
    const bar = document.getElementById('status-bar');
    bar.innerText        = text;
    bar.style.background = bg;
    bar.style.color      = col;
}

/**
 * Sets the large centre-screen announcer text.
 * @param {string}  text       - Announcement
 * @param {boolean} [vis=true] - Show or hide
 * @param {string}  [cls]      - Tailwind colour class
 */
function setCenterAnnouncer(text, vis = true, cls = 'text-white') {
    const el   = document.getElementById('announcer');
    el.innerText = text;
    el.className = `text-2xl font-black uppercase text-center transition-all ${cls} ${
        vis ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
    }`;
}


// =============================================================
// SECTION 7 — CARD RENDERING
// =============================================================

/**
 * Generates the inner HTML for a playing card element.
 *
 * Three rendering modes:
 *  mini=false, lightning=null  → normal deal card (face-down → flips up)
 *  mini=false, lightning={…}   → lightning-struck card (gold border + badge)
 *  mini=true                   → small face-up preview in the lightning strip
 *
 * @param {{ n:string, suit:string }} card        - Card data
 * @param {boolean}                  [mini=false] - Render as mini preview
 * @param {{ mult:number }|null}     [lightning]  - Lightning match data
 * @returns {string} HTML string
 */
function getCardHTML(card, mini = false, lightning = null) {
    const colorCls = (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-black';
    const badge    = lightning
        ? `<div class="absolute -top-2 -right-2 bg-yellow-400 text-black font-bold text-[9px] px-1 rounded shadow z-10">x${lightning.mult}</div>`
        : '';

    if (mini) {
        return `<div class="card-inner">
                    <div class="card-back"></div>
                    <div class="card-front ${colorCls} border-2 border-yellow-400 shadow-[0_0_10px_#eab308] bg-yellow-50/90">
                        <div class="absolute top-0 right-0 bg-black text-yellow-400 text-[8px] font-black px-1">x${card.mult}</div>
                        <div class="font-bold text-sm leading-none mt-1 ml-1">${card.n}</div>
                        <div class="text-2xl self-center">${card.suit}</div>
                    </div>
                </div>`;
    }

    return `<div class="card-inner">
                <div class="card-back"></div>
                <div class="card-front ${colorCls} ${lightning ? 'is-lightning' : 'border-gray-300'}">${badge}
                    <div class="font-bold text-lg leading-none">${card.n}</div>
                    <div class="text-4xl self-center">${card.suit}</div>
                    <div class="font-bold text-lg leading-none text-right rotate-180">${card.n}</div>
                </div>
            </div>`;
}


// =============================================================
// SECTION 8 — DECK CONSTRUCTION
// =============================================================

/**
 * Builds and shuffles a standard 8-deck baccarat shoe (416 cards).
 *
 * Algorithm: Fisher-Yates (Knuth) using crypto.getRandomValues() for
 * every swap index — no Math.random(), no modulo bias.
 *
 * @returns {Array<{ n:string, v:number, suit:string }>} Shuffled shoe
 */
function createDeck() {
    const shoe = [];
    for (let d = 0; d < 8; d++)
        for (const suit of suits)
            for (const val of values)
                shoe.push({ ...val, suit });

    for (let i = shoe.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i);
        [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
    return shoe;
}

/**
 * Creates and shuffles a unique 52-card virtual deck used solely for
 * drawing Lightning Cards each round.
 *
 * Per Evolution Gaming official rules: Lightning Cards are drawn from
 * "a virtual 52-card deck" — each card can appear AT MOST ONCE per
 * round as a Lightning Card, preventing duplicate multiplier assignments.
 *
 * @returns {Array<{ n:string, v:number, suit:string }>} Shuffled 52-card deck
 */
function createVirtual52Deck() {
    const deck = [];
    for (const suit of suits)
        for (const val of values)
            deck.push({ ...val, suit });

    for (let i = deck.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}


// =============================================================
// SECTION 9 — GAME FLOW
// =============================================================

/**
 * Animates the Lightning multiplier reveal phase at the start of a round.
 *
 * @param {Array<{ n:string, suit:string, mult:number }>} preCalcCards
 *   Pre-calculated lightning cards from the background result.
 */
async function triggerLightning(preCalcCards) {
    setStatus('GENERATING LIGHTNING...', '#ca8a04', 'white');
    document.getElementById('lightning-status').innerText = 'STRIKING MULTIPLIERS';
    document.getElementById('lightning-container').innerHTML = '';

    currentLightning = preCalcCards || [];
    const container  = document.getElementById('lightning-container');

    for (const card of currentLightning) {
        playLightningSound();
        const el     = document.createElement('div');
        el.className = 'card-container mini';
        el.innerHTML = getCardHTML(card, true);
        container.appendChild(el);
        await sleep(100);
        el.classList.add('deal', 'flipped');
    }

    document.getElementById('lightning-status').innerText = 'MULTIPLIERS ACTIVE';
    setStatus('BETS CLOSED', '#b91c1c', 'white');
}

/**
 * Animates a single card being dealt into a hand container.
 * Fires a lightning-hit animation if the card matches a struck card.
 *
 * @param {{ n:string, v:number, suit:string }} card - Card to deal
 * @param {string}                              elId - Target container ID
 * @param {number}                              pos  - Position index (0–2)
 * @returns {Promise<number>} Multiplier for this card (1 if no match)
 */
async function dealCard(card, elId, pos) {
    playCardSound();
    const container = document.getElementById(elId);
    const el        = document.createElement('div');
    el.className    = `card-container card-pos-${pos}`;

    const lCard  = currentLightning.find(l => l.n === card.n && l.suit === card.suit);
    el.innerHTML = getCardHTML(card, false, lCard);
    container.appendChild(el);

    await sleep(50);
    el.classList.add('deal');
    await sleep(200);
    el.classList.add('flipped');

    if (lCard) {
        playLightningSound();
        el.classList.add('lightning-hit');
        setTimeout(() => el.classList.remove('lightning-hit'), 600);
    }

    return lCard ? lCard.mult : 1;
}

/**
 * Main game-round orchestrator.
 * Follows standard Punto Banco (identical to Evolution Gaming live baccarat).
 *
 * ── Official Lightning Baccarat payout rules ────────────────────────
 *
 * Player  win  │ 1:1 base  × combined player-hand lightning multiplier
 * Banker  win  │ 0.95:1    × combined banker-hand lightning multiplier
 *              │   (5% commission applied after multiplier)
 * Tie          │ 5:1 base  × (player mult × banker mult combined)
 *              │   Player/Banker stakes returned unchanged on a Tie
 * Player Pair  │ 9:1 base  × multiplier from first two player cards only
 * Banker Pair  │ 9:1 base  × multiplier from first two banker cards only
 *              │   Pair bets resolve independently of the main hand winner
 *
 * Lightning matching: card RANK and SUIT must both match.
 * Multiple Lightning Cards in the same hand → multipliers MULTIPLY together.
 * Maximum theoretical: 512× for Player/Banker; 262,144× for Tie.
 *
 * ── Execution order ────────────────────────────────────────────────
 * 1. Background math  — complete round result calculated instantly
 * 2. Save to storage  — committed before any animation starts
 * 3. Lightning reveal — multiplier cards shown in the top strip
 * 4. Card animation   — cards dealt with staggered delays
 * 5. Resolution       — payout announced, roadmap/history updated
 */
async function dealGame() {
    if (isPlaying) return;
    isPlaying = true;

    // ── 1. Build shoe and draw cards ──────────────────────────────
    const shoe  = createDeck();
    const pCard1 = shoe.pop(), pCard2 = shoe.pop();
    const bCard1 = shoe.pop(), bCard2 = shoe.pop();

    let pScore = (pCard1.v + pCard2.v) % 10;
    let bScore = (bCard1.v + bCard2.v) % 10;
    let pCard3 = null, bCard3 = null;

    // Third-card rules (Punto Banco standard)
    if (pScore < 8 && bScore < 8) {
        let pDrewThird = false, pThirdVal = 0;

        if (pScore <= 5) {
            pCard3     = shoe.pop();
            pDrewThird = true;
            pThirdVal  = pCard3.v;
            pScore     = (pScore + pThirdVal) % 10;
        }

        let bankerDraws = false;
        if (pDrewThird) {
            bankerDraws = (
                bScore <= 2 ||
                (bScore === 3 && pThirdVal !== 8) ||
                (bScore === 4 && [2,3,4,5,6,7].includes(pThirdVal)) ||
                (bScore === 5 && [4,5,6,7].includes(pThirdVal)) ||
                (bScore === 6 && [6,7].includes(pThirdVal))
            );
        } else if (bScore <= 5) {
            bankerDraws = true;
        }

        if (bankerDraws) {
            bCard3 = shoe.pop();
            bScore = (bScore + bCard3.v) % 10;
        }
    }

    // ── 2. Lightning selection ────────────────────────────────────
    //
    // Official rules:
    //  • 1–5 cards from a unique virtual 52-card deck (no duplicates)
    //  • Each card gets one of {2×,3×,4×,5×,8×} with equal 20% probability
    //  • Match requires both rank AND suit
    const virtualDeck    = createVirtual52Deck();
    const lightningCount = secureRandomInt(1, 5);
    const lightningCards = [];
    for (let i = 0; i < lightningCount; i++) {
        lightningCards.push({ ...virtualDeck.pop(), mult: weightedRandom(LIGHTNING_MULT_TABLE) });
    }

    // ── 3. Multiplier computation ─────────────────────────────────
    //
    // pMultTotal / bMultTotal : all cards in each hand (for main bets & Tie)
    // pPairMult  / bPairMult  : first two cards only (for Pair side bets)
    let pMultTotal = 1, bMultTotal = 1;
    let pPairMult  = 1, bPairMult  = 1;

    [pCard1, pCard2, pCard3].filter(Boolean).forEach((c, idx) => {
        const hit = lightningCards.find(l => l.n === c.n && l.suit === c.suit);
        if (hit) {
            pMultTotal *= hit.mult;
            if (idx < 2) pPairMult *= hit.mult;
        }
    });
    [bCard1, bCard2, bCard3].filter(Boolean).forEach((c, idx) => {
        const hit = lightningCards.find(l => l.n === c.n && l.suit === c.suit);
        if (hit) {
            bMultTotal *= hit.mult;
            if (idx < 2) bPairMult *= hit.mult;
        }
    });

    // ── 4. Payout calculation ─────────────────────────────────────
    const winner  = pScore > bScore ? 'P' : bScore > pScore ? 'B' : 'T';
    const baseBet = totalBetAmount;
    let   payout  = 0;
    const pHasPair = pCard1.n === pCard2.n;
    const bHasPair = bCard1.n === bCard2.n;

    if (winner === 'P' && bets.player > 0)
        payout += bets.player + (bets.player * pMultTotal);               // 1:1 × mult

    if (winner === 'B' && bets.banker > 0)
        payout += bets.banker + (0.95 * bets.banker * bMultTotal);        // 0.95:1 × mult

    if (winner === 'T') {
        if (bets.tie > 0)
            payout += bets.tie + (5 * bets.tie * pMultTotal * bMultTotal); // 5:1 × combined
        payout += bets.player + bets.banker;  // Stake returned on Tie
    }

    // Pair bets — independent of main hand winner
    if (pHasPair && bets.playerPair > 0)
        payout += bets.playerPair + (9 * bets.playerPair * pPairMult);    // 9:1 × pair mult

    if (bHasPair && bets.bankerPair > 0)
        payout += bets.bankerPair + (9 * bets.bankerPair * bPairMult);    // 9:1 × pair mult

    // ── 5. Commit state ───────────────────────────────────────────
    displayBalance = balance;
    balance += payout;

    const now     = new Date();
    const dateStr = new Intl.DateTimeFormat('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(now);
    const timeStr = new Intl.DateTimeFormat('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(now).replace(/:/g, '.');

    if (baseBet > 0) {
        gameHistory.unshift({ dateStr, timeStr, bet: baseBet, net: payout - baseBet });
    }

    stats.total++;
    if (winner === 'P') stats.p++;
    else if (winner === 'B') stats.b++;
    else stats.t++;

    addRoadmap(winner);

    // Append a full round record to the plain-text game log
    appendGameLog({
        pCard1, pCard2, pCard3,
        bCard1, bCard2, bCard3,
        lightningCards,
        pScore, bScore,
        pMultTotal, bMultTotal,
        winner,
        betsSnapshot: { ...bets },   // snapshot before clearing
        baseBet,
        payout,
        dateStr,
        timeStr,
    });

    saveGameData();

    // Anti-refresh abuse: the round result is already calculated here,
    // before cards animate. Save the final balance to the server now,
    // so refreshing during the animation cannot restore the previous balance.
    await syncBalanceToServer(true);

    // ── 6. Animation ──────────────────────────────────────────────
    updateUI();
    ['p-cards','b-cards'].forEach(id => document.getElementById(id).innerHTML = '');
    ['p-score','b-score','p-mult','b-mult','payout-txt'].forEach(id =>
        document.getElementById(id).classList.add('opacity-0'));
    setCenterAnnouncer('BETS CLOSED', true, 'text-red-500');

    await triggerLightning(lightningCards);
    await sleep(1000);
    setCenterAnnouncer('', false);

    const showMult  = (id, m)  => { if (m > 1) { const el = document.getElementById(id); el.innerText = `x${m}`; el.classList.remove('opacity-0'); } };
    const showScore = (id, sc) => { const el = document.getElementById(id); el.innerText = sc; el.classList.remove('opacity-0'); };

    let pVis = 1, bVis = 1;
    pVis *= await dealCard(pCard1, 'p-cards', 0); showMult('p-mult', pVis); await sleep(300);
    bVis *= await dealCard(bCard1, 'b-cards', 0); showMult('b-mult', bVis); await sleep(300);
    pVis *= await dealCard(pCard2, 'p-cards', 1); showMult('p-mult', pVis); await sleep(300);
    bVis *= await dealCard(bCard2, 'b-cards', 1); showMult('b-mult', bVis); await sleep(500);

    // Show 2-card scores first
    showScore('p-score', (pCard1.v + pCard2.v) % 10);
    showScore('b-score', (bCard1.v + bCard2.v) % 10);

    // ── BUG FIX ──────────────────────────────────────────────────
    // Previously these were wrapped in: if (pScore < 8 && bScore < 8)
    // That used the FINAL scores. If Banker drew a third card reaching 8,
    // bScore < 8 was FALSE → third card never animated, score stuck at 2,
    // screen showed e.g. "P=6 B=2 BANKER WINS" — visually impossible.
    //
    // Correct fix: check whether pCard3/bCard3 were actually drawn
    // (they are only set when the rules required it, regardless of final score).
    if (pCard3) {
        await sleep(500);
        pVis *= await dealCard(pCard3, 'p-cards', 2);
        showMult('p-mult', pVis);
        showScore('p-score', pScore);   // update to final 3-card score
    }
    if (bCard3) {
        await sleep(500);
        bVis *= await dealCard(bCard3, 'b-cards', 2);
        showMult('b-mult', bVis);
        showScore('b-score', bScore);   // update to final 3-card score
    }
    // ─────────────────────────────────────────────────────────────

    dealtCardsCount += 4 + (pCard3 ? 1 : 0) + (bCard3 ? 1 : 0);
    await sleep(1000);

    document.getElementById('stat-total').innerText = `# ${stats.total}`;
    document.getElementById('stat-p').innerText     = stats.p;
    document.getElementById('stat-b').innerText     = stats.b;
    document.getElementById('stat-t').innerText     = stats.t;
    renderRoadmap();
    renderHistory();
    resolveBets(winner, payout);
}

/**
 * Applies the pre-calculated payout, plays winner-specific audio,
 * announces the result, and schedules the next round countdown.
 *
 * Sound mapping:
 *  Player win (payout > 0) → bright ascending fanfare
 *  Banker win (payout > 0) → deeper brass fanfare
 *  Tie                     → suspended open chord
 *  No payout (loss)        → descending clear sweep
 *
 * @param {"P"|"B"|"T"} winner - Round winner code
 * @param {number}      payout - Total amount returned to player
 */
function resolveBets(winner, payout) {
    displayBalance = null;
    updateUI();

    if (winner === 'P') {
        setStatus('PLAYER WINS', '#1d4ed8', 'white');
        setCenterAnnouncer('PLAYER WINS', true, 'text-blue-500');
        if (payout > 0) playPlayerWinSound(); else playClearSound();
    } else if (winner === 'B') {
        setStatus('BANKER WINS', '#b91c1c', 'white');
        setCenterAnnouncer('BANKER WINS', true, 'text-red-500');
        if (payout > 0) playBankerWinSound(); else playClearSound();
    } else {
        setStatus('TIE', '#15803d', 'white');
        setCenterAnnouncer('TIE', true, 'text-green-500');
        playTieSound();
    }

    if (payout > 0) {
        const el   = document.getElementById('payout-txt');
        el.innerText = `PAYOUT: ${fmtIdr(payout)}`;
        el.classList.remove('opacity-0');
    }

    setTimeout(() => {
        setCenterAnnouncer('', false);
        document.getElementById('payout-txt').classList.add('opacity-0');
        if (balance >= 3e4) setStatus('PLACE YOUR BETS', '#1f8f45', 'white');
        document.getElementById('lightning-status').innerText = 'WAITING FOR BETS';
        document.getElementById('lightning-container').innerHTML = '';
        bets           = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 };
        totalBetAmount = 0;
        isPlaying      = false;
        if (activeChip === 0 && balance >= 3e4) selectChip(25e3);
        updateUI();
        startNextRoundCountdown();
    }, 3500);
}


// =============================================================
// SECTION 10 — ROADMAP (BIG ROAD)
// =============================================================

/**
 * Updates the Big Road matrix with a new round result.
 * Ties are recorded as marks on the previous non-Tie cell —
 * standard baccarat roadmap convention.
 *
 * @param {"P"|"B"|"T"} result - Round outcome
 */
function addRoadmap(result) {
    if (result === 'T') {
        if (lastWinner !== null && bigRoadMatrix[currCol][currRow] !== null)
            bigRoadMatrix[currCol][currRow].ties = (bigRoadMatrix[currCol][currRow].ties || 0) + 1;
        else { bigRoadMatrix[0][0] = { res: 'T', ties: 1 }; lastWinner = 'T'; }
        return;
    }

    const prevIsInitialTie = lastWinner === 'T' && currRow === 0 && currCol === 0 && bigRoadMatrix[0][0]?.res === 'T';

    if (lastWinner === null || prevIsInitialTie) {
        bigRoadMatrix[0][0] = { res: result, ties: bigRoadMatrix[0][0] ? bigRoadMatrix[0][0].ties : 0 };
    } else if (result === lastWinner) {
        currRow++;
        if (currRow > 5 || bigRoadMatrix[currCol][currRow] !== null) { currRow--; currCol++; }
        if (currCol < 28) bigRoadMatrix[currCol][currRow] = { res: result, ties: 0 };
    } else {
        currCol++; currRow = 0;
        while (currCol < 28 && bigRoadMatrix[currCol][currRow] !== null) currCol++;
        if (currCol < 28) bigRoadMatrix[currCol][currRow] = { res: result, ties: 0 };
    }

    lastWinner = result;
}

/**
 * Re-renders the entire Big Road grid from bigRoadMatrix.
 * Player = hollow blue circle; Banker = hollow red circle;
 * Tie    = diagonal green line across the current cell.
 */
function renderRoadmap() {
    const grid = document.getElementById('roadmap-grid');
    grid.querySelectorAll('.road-cell').forEach(el => el.remove());

    for (let col = 0; col < 28; col++) {
        for (let row = 0; row < 6; row++) {
            const cell = bigRoadMatrix[col][row];
            if (!cell) continue;

            const div = document.createElement('div');
            div.className = 'road-cell';
            div.style.gridColumn = col + 1;
            div.style.gridRow    = row + 1;

            const cc = cell.res === 'P' ? 'hc-blue' : cell.res === 'B' ? 'hc-red' : '';
            let html = '';
            if (cc) html += `<div class="hollow-circle ${cc}"></div>`;
            if (cell.ties > 0) html += '<div class="tie-line"></div>';
            div.innerHTML = html;
            grid.appendChild(div);
        }
    }
}


// =============================================================
// SECTION 11 — HISTORY PANEL
// =============================================================

/**
 * Toggles the sliding history drawer.
 * Blocked during reshuffles unless the drawer is already open.
 */
function toggleHistory() {
    const modal = document.getElementById('history-modal');
    if (isReshuffling && !modal.classList.contains('open')) return;
    playChipSound();
    modal.classList.toggle('open');
}

/**
 * Re-renders the history drawer contents, grouped by calendar date.
 * Shows net P&L per day and per round.
 */
function renderHistory() {
    const area = document.getElementById('history-content-area');
    area.innerHTML = '';

    if (gameHistory.length === 0) {
        area.innerHTML = '<div class="text-center text-gray-500 mt-10 text-sm">Belum ada riwayat</div>';
        return;
    }

    const byDate = {};
    gameHistory.forEach(e => {
        if (!byDate[e.dateStr]) byDate[e.dateStr] = { items: [], totalNet: 0 };
        byDate[e.dateStr].items.push(e);
        byDate[e.dateStr].totalNet += e.net;
    });

    for (const [date, group] of Object.entries(byDate)) {
        const netLabel = group.totalNet >= 0 ? `+${fmtIdr(group.totalNet)}` : `-${fmtIdr(Math.abs(group.totalNet))}`;
        const netCls   = group.totalNet >= 0 ? 'val-pos' : 'val-neg';
        let html = `<details class="history-day" open><summary><span>${date}</span><span class="day-total ${netCls}">${netLabel}</span></summary>`;
        group.items.forEach(e => {
            const net    = e.net >= 0 ? `+${fmtIdr(e.net)}` : `-${fmtIdr(Math.abs(e.net))}`;
            const nClass = e.net >= 0 ? 'val-pos' : 'val-neg';
            html += `<div class="history-item">
                        <div class="history-item-left"><span class="game-name">Lightning Baccarat</span><span class="game-time">${e.timeStr}</span></div>
                        <div class="history-item-right"><span class="game-net ${nClass}">${net}</span><span class="game-bet">${fmtIdr(e.bet)}</span></div>
                     </div>`;
        });
        html += '</details>';
        area.insertAdjacentHTML('beforeend', html);
    }
}


// =============================================================
// SECTION 12 — SHOE MANAGEMENT & AUTO-PLAY LOOP
// =============================================================

/**
 * Reshuffles when the Big Road fills (27 cols) or 364 cards are dealt.
 * Plays shuffle sounds during the 3.5-second animation.
 * Resets all board state (matrix, stats, roadmap, counts) on completion.
 */
async function resetShoeIfNeeded() {
    isReshuffling = true;
    updateUI();
    document.getElementById('reshuffle-overlay').classList.add('show');

    const sfx = setInterval(playShuffleSound, 450);
    await sleep(3500);
    clearInterval(sfx);

    dealtCardsCount = 0;
    bigRoadMatrix   = Array(28).fill(null).map(() => Array(6).fill(null));
    currCol = 0; currRow = 0; lastWinner = null;
    stats   = { total: 0, p: 0, b: 0, t: 0 };

    renderRoadmap();
    document.getElementById('stat-total').innerText = '# 0';
    document.getElementById('stat-p').innerText     = '0';
    document.getElementById('stat-b').innerText     = '0';
    document.getElementById('stat-t').innerText     = '0';

    document.getElementById('reshuffle-overlay').classList.remove('show');
    isReshuffling = false;
    saveGameData();
    updateUI();
}

/**
 * Polling loop that starts a new deal when the countdown hits zero
 * and no round is in progress. Runs every 300 ms.
 */
function autoRunLoop() {
    setInterval(async () => {
        if (!isPlaying && autoCountdown <= 0) {
            isPlaying = true;
            hideCountdownOverlay();
            if (currCol >= 27 || dealtCardsCount >= 364) await resetShoeIfNeeded();
            isPlaying = false;
            dealGame();
        }
    }, 300);
}

/** Shows the between-round countdown overlay. */
function showCountdownOverlay() {
    document.getElementById('countdown-overlay')?.classList.add('show');
}

/** Hides the between-round countdown overlay. */
function hideCountdownOverlay() {
    document.getElementById('countdown-overlay')?.classList.remove('show');
}

/** Seconds remaining until the next automatic deal. */
let autoCountdown = 8;

/**
 * Starts the 8-second countdown before each new round.
 * Plays a soft tick each second and shows the overlay.
 */
function startNextRoundCountdown() {
    autoCountdown = 8;
    showCountdownOverlay();
    updateUI();

    const numEl = document.getElementById('round-countdown');
    if (numEl) numEl.innerText = autoCountdown;

    const timer = setInterval(() => {
        if (isPlaying) { clearInterval(timer); hideCountdownOverlay(); return; }
        autoCountdown--;
        if (numEl) numEl.innerText = autoCountdown;
        if (autoCountdown > 0) playCountdownTick();
        if (autoCountdown <= 0) clearInterval(timer);
    }, 1000);
}


// =============================================================
// SECTION 13 — PERSISTENT SAVE SYSTEM
//
// Balance, bets, history, and roadmap are serialised to
// localStorage after every state-changing operation so progress
// survives page reloads and browser crashes.
// =============================================================

/**
 * Frozen balance value used to hide winnings from the UI during
 * the card-deal animation. null = show real balance.
 * @type {number|null}
 */
let displayBalance = null;

// Intercept updateUI to show the frozen balance during animations
const _origUI = updateUI;
updateUI = function () {
    const real = balance;
    if (displayBalance !== null) balance = displayBalance;
    _origUI();
    balance = real;
};

/**
 * Serialises all game state to localStorage under 'lightningJoSave'.
 * Called after every game-critical mutation.
 */
function saveGameData() {
    localStorage.setItem(getGameSaveKey(), JSON.stringify({
        balance: balance, pendingBet: isPlaying ? 0 : totalBetAmount,
        history: gameHistory, matrix: bigRoadMatrix, stats,
        currCol, currRow, lastWinner,
    }));
}

/**
 * Loads persisted state from localStorage on startup.
 * Crash recovery: any in-flight bet (pendingBet > 0) is refunded.
 * Also restores the game log and round counter.
 */
function loadGameData() {
    // Load game state
    const raw = localStorage.getItem(getGameSaveKey());
    if (!raw) { saveGameData(); }
    else {
        const data = JSON.parse(raw);
        let   needsResave = false;
        if (data.balance !== undefined) {
            balance = data.balance;
            if (data.pendingBet > 0) { balance += data.pendingBet; needsResave = true; }
        }
        if (data.history)               gameHistory   = data.history;
        if (data.matrix)                bigRoadMatrix = data.matrix;
        if (data.stats)                 stats         = data.stats;
        if (data.currCol !== undefined) currCol       = data.currCol;
        if (data.currRow !== undefined) currRow       = data.currRow;
        if (data.lastWinner !== undefined) lastWinner = data.lastWinner;
        if (needsResave) saveGameData();
    }

    // Load game log + round counter
    try {
        const logRaw = localStorage.getItem(getGameLogKey());
        if (logRaw) {
            const logData  = JSON.parse(logRaw);
            gameLog        = logData.entries  || [];
            roundCounter   = logData.counter  || 0;
        }
    } catch (e) {
        gameLog = []; roundCounter = 0;
    }
}

// Account-scoped local data keys. Balance is stored on the server;
// history/roadmap remain local per username so accounts do not mix UI history.
let currentAuthUser = null;
let gameBooted = false;
let authMode = 'login';
let saveBalanceTimer = null;

function getGameSaveKey() {
    return 'lightningJoSave_' + (currentAuthUser?.username || 'guest');
}

function getGameLogKey() {
    return 'lightningJoGameLog_' + (currentAuthUser?.username || 'guest');
}

function setAuthMode(mode) {
    authMode = mode;
    document.getElementById('auth-login-tab')?.classList.toggle('active', mode === 'login');
    document.getElementById('auth-register-tab')?.classList.toggle('active', mode === 'register');
    const btn = document.getElementById('auth-submit-btn');
    if (btn) btn.innerText = mode === 'login' ? 'LOGIN' : 'REGISTER';
    const err = document.getElementById('auth-error');
    if (err) err.innerText = '';
}

function setAuthError(message) {
    const err = document.getElementById('auth-error');
    if (err) err.innerText = message || '';
}

async function authRequest(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

async function submitAuth(event) {
    event.preventDefault();
    const username = document.getElementById('auth-username')?.value.trim();
    const password = document.getElementById('auth-password')?.value;
    const btn = document.getElementById('auth-submit-btn');
    if (!username || !password) return;
    setAuthError('');
    if (btn) { btn.disabled = true; btn.innerText = 'PLEASE WAIT...'; }
    try {
        const data = await authRequest(`/api/${authMode}`, { username, password });
        startAuthenticatedGame(data.user);
    } catch (e) {
        setAuthError(e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = authMode === 'login' ? 'LOGIN' : 'REGISTER'; }
    }
}

async function logoutAuth() {
    try { await authRequest('/api/logout', {}); } catch (e) {}
    location.reload();
}

async function syncBalanceToServer(immediate = false) {
    if (!currentAuthUser) return;
    clearTimeout(saveBalanceTimer);

    const payload = JSON.stringify({ balance: Math.max(0, Math.floor(balance)) });
    const sendNow = () => fetch('/api/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: payload,
    }).catch(() => {});

    if (immediate) {
        return sendNow();
    }

    saveBalanceTimer = setTimeout(sendNow, 250);
}

function syncBalanceBeforeUnload() {
    if (!currentAuthUser) return;
    const payload = JSON.stringify({ balance: Math.max(0, Math.floor(balance)) });
    if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/balance', new Blob([payload], { type: 'application/json' }));
    }
}

window.addEventListener('pagehide', syncBalanceBeforeUnload);

// Wrap mutating functions to auto-save after each call
const _origTopUp = topUpBalance; topUpBalance = function ()  { _origTopUp();  saveGameData(); syncBalanceToServer(); };
const _origClear = clearBets;   clearBets    = function ()  { _origClear();  saveGameData(); syncBalanceToServer(); };
const _origPlace = placeBet;    placeBet     = function (z) { _origPlace(z); saveGameData(); syncBalanceToServer(true); };
const _origUndo  = undoBet;     undoBet      = function (z) { _origUndo(z);  saveGameData(); syncBalanceToServer(true); };

const _origDealGame = dealGame;
dealGame = async function () {
    await _origDealGame();
    saveGameData();
    syncBalanceToServer(true);
};


// =============================================================
// SECTION 14 — BOOT SEQUENCE
// =============================================================

function bootGame() {
    if (gameBooted) return;
    gameBooted = true;
    loadGameData();
    // Server balance always wins over browser localStorage balance.
    if (currentAuthUser?.balance !== undefined) balance = Number(currentAuthUser.balance);
    updateUI();
    document.getElementById('stat-total').innerText = `# ${stats.total}`;
    document.getElementById('stat-p').innerText     = stats.p;
    document.getElementById('stat-b').innerText     = stats.b;
    document.getElementById('stat-t').innerText     = stats.t;
    renderRoadmap();
    if (gameHistory.length > 0) renderHistory();
    autoRunLoop();
    startNextRoundCountdown();
}

function startAuthenticatedGame(user) {
    currentAuthUser = user;
    const label = document.getElementById('auth-user-label');
    if (label) label.innerText = user.username;
    document.getElementById('auth-overlay')?.classList.add('hide');
    bootGame();
}

(async function initAuth() {
    try {
        const data = await authRequest('/api/me');
        startAuthenticatedGame(data.user);
    } catch (e) {
        document.getElementById('auth-overlay')?.classList.add('show');
        setAuthMode('login');
    }
})();
