<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lightning JO Baccarat</title>
    <link rel="icon" type="image/x-icon"
          href="https://img.icons8.com/?size=100&id=UnYwluJUelEQ&format=png&color=000000">
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="/css/style.css?v=php1">
</head>
<body>

<!-- AUTH OVERLAY: Login / Register -->
<div id="auth-overlay">
    <div class="auth-card">
        <div class="auth-brand">
            <div class="auth-title">LIGHTNING JO</div>
            <div class="auth-subtitle">LOGIN TO SAVE YOUR BALANCE</div>
        </div>

        <div class="auth-tabs">
            <button class="auth-tab active" id="auth-login-tab" onclick="setAuthMode('login')">Login</button>
            <button class="auth-tab" id="auth-register-tab" onclick="setAuthMode('register')">Register</button>
        </div>

        <form class="auth-form" onsubmit="submitAuth(event)">
            <label>Username</label>
            <input id="auth-username" autocomplete="username" minlength="3" maxlength="32" placeholder="Enter username" required>
            <label>Password</label>
            <input id="auth-password" type="password" autocomplete="current-password" minlength="6" placeholder="Enter password" required>
            <button class="auth-submit" id="auth-submit-btn" type="submit">LOGIN</button>
            <div class="auth-error" id="auth-error"></div>
        </form>
    </div>
</div>

<!-- LOBBY / DASHBOARD OVERLAY – dismissed by enterGame() -->
<div id="lobby-overlay">
    <div class="lobby-header">
        <div class="lobby-logo">LIGHTNING JO<span>CASINO GAMES</span></div>
        <div class="lobby-user"><span id="auth-user-label">Guest</span><button onclick="logoutAuth()">LOGOUT</button></div>
        <div class="lobby-badge">⚡ LIVE PLATFORM</div>
    </div>
    <div class="lobby-body">
        <div class="lobby-section-title">Select Your Game</div>
        <div class="lobby-grid">
            <!-- Game 1: Lightning JO Baccarat (ACTIVE) -->
            <div class="game-card playable" onclick="enterGame()">
                <div class="game-card-thumb thumb-baccarat">🃏<div class="lightning-badge">⚡ LIGHTNING</div></div>
                <div class="game-card-body">
                    <div class="game-card-name">Lightning JO<br>Baccarat</div>
                    <div class="game-card-type">Card Game · Live</div>
                    <div class="game-card-footer"><button class="btn-play-now">▶ PLAY NOW</button></div>
                </div>
            </div>
            <!-- Game 2: Dragon Tiger -->
            <div class="game-card">
                <div class="game-card-thumb thumb-dragon">🐉</div>
                <div class="game-card-body">
                    <div class="game-card-name">Dragon<br>Tiger</div>
                    <div class="game-card-type">Card Game · Live</div>
                    <div class="game-card-footer"><div class="coming-soon-tag">COMING SOON</div></div>
                </div>
            </div>
            <!-- Game 3: Lightning Roulette -->
            <div class="game-card">
                <div class="game-card-thumb thumb-roulette">🎡</div>
                <div class="game-card-body">
                    <div class="game-card-name">Lightning<br>Roulette</div>
                    <div class="game-card-type">Table Game · Live</div>
                    <div class="game-card-footer"><div class="coming-soon-tag">COMING SOON</div></div>
                </div>
            </div>
            <!-- Game 4: Sic Bo -->
            <div class="game-card">
                <div class="game-card-thumb thumb-sicbo">🎲</div>
                <div class="game-card-body">
                    <div class="game-card-name">Sic Bo</div>
                    <div class="game-card-type">Dice Game · Live</div>
                    <div class="game-card-footer"><div class="coming-soon-tag">COMING SOON</div></div>
                </div>
            </div>
            <!-- Game 5: Teen Patti -->
            <div class="game-card">
                <div class="game-card-thumb thumb-patti">🎴</div>
                <div class="game-card-body">
                    <div class="game-card-name">Teen Patti</div>
                    <div class="game-card-type">Card Game · Live</div>
                    <div class="game-card-footer"><div class="coming-soon-tag">COMING SOON</div></div>
                </div>
            </div>
            <!-- Game 6: Blackjack Classic -->
            <div class="game-card">
                <div class="game-card-thumb thumb-blackjack">♠</div>
                <div class="game-card-body">
                    <div class="game-card-name">Blackjack<br>Classic</div>
                    <div class="game-card-type">Card Game · Live</div>
                    <div class="game-card-footer"><div class="coming-soon-tag">COMING SOON</div></div>
                </div>
            </div>
        </div>
    </div>
    <div class="lobby-footer">LIGHTNING JO &middot; PLAY RESPONSIBLY &middot; 18+ ONLY</div>
</div>

<!-- GAME AREA: Table + Cards -->
<div class="flex items-center flex-col justify-center flex-1 game-area relative">
    <div class="dragon-bg"></div>

    <div class="reshuffle-ui" id="reshuffle-overlay">
        <div class="shuffling-cards"></div>
        <div class="reshuffle-text">RESHUFFLING</div>
    </div>

    <div class="countdown-ui" id="countdown-overlay">
        <div class="countdown-box">
            <div class="countdown-label">NEXT ROUND STARTS IN</div>
            <div class="countdown-number"><span id="round-countdown">8</span></div>
        </div>
    </div>

    <div class="flex items-center flex-col absolute left-0 right-0 top-4 z-10">
        <div class="font-bold tracking-widest lightning-glow mb-2 text-xs text-yellow-400" id="lightning-status">WAITING FOR BETS</div>
        <div class="flex h-[75px]" id="lightning-container"></div>
    </div>

    <div class="flex mt-16 space-x-12 z-0">
        <!-- Player Hand -->
        <div class="flex items-center flex-col">
            <div class="mb-4 text-center">
                <span class="font-bold tracking-widest drop-shadow text-sm text-blue-500">PLAYER</span>
                <div class="flex items-center justify-center mt-1 space-x-2">
                    <div class="font-bold opacity-0 text-4xl text-white transition-opacity" id="p-score">0</div>
                    <div class="font-bold opacity-0 bg-yellow-500 px-1.5 py-0.5 rounded text-black text-xs" id="p-mult">x1</div>
                </div>
            </div>
            <div class="relative h-[104px] w-[280px]" id="p-cards"></div>
        </div>
        <!-- Centre announcer -->
        <div class="flex items-center flex-col justify-center min-w-[200px]">
            <div class="opacity-0 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] font-black scale-90 text-2xl transition-all uppercase" id="announcer">PLACE BETS</div>
            <div class="font-bold opacity-0 mt-2 text-lg text-yellow-400" id="payout-txt"></div>
        </div>
        <!-- Banker Hand -->
        <div class="flex items-center flex-col">
            <div class="mb-4 text-center">
                <span class="font-bold tracking-widest drop-shadow text-sm text-red-500">BANKER</span>
                <div class="flex items-center justify-center mt-1 space-x-2">
                    <div class="font-bold opacity-0 text-4xl text-white transition-opacity" id="b-score">0</div>
                    <div class="font-bold opacity-0 bg-yellow-500 px-1.5 py-0.5 rounded text-black text-xs" id="b-mult">x1</div>
                </div>
            </div>
            <div class="relative h-[104px] w-[280px]" id="b-cards"></div>
        </div>
    </div>
</div>

<!-- FLOATING CONTROLS: History only -->
<div class="controls-overlay">
    <button class="btn-pill history-btn" onclick="toggleHistory()" id="history-btn">HISTORY</button>
</div>

<!-- HISTORY SLIDE-IN DRAWER -->
<div id="history-modal">
    <div class="history-header">
        <div class="history-title">RIWAYAT</div>
        <div class="close-history" onclick="toggleHistory()">×</div>
    </div>
    <div class="history-content" id="history-content-area"></div>
</div>

<!-- BOTTOM PANEL: Logo | Bet Table | Roadmap -->
<div class="w-full bottom-panel">
    <!-- Logo + balance -->
    <div class="w-[18%] logo-area">
        <div class="fee-bar">20% Fee</div>
        <div class="logo-text my-auto text-3xl">
            <div class="font-black text-4xl tracking-wider">LIGHTNING JO</div>
            <div class="font-bold text-xs tracking-[8px] mt-2">BACCARAT</div>
        </div>
        <div class="balance-widget mt-auto pb-1">
            <div class="bal-box bg-[#111]"><span class="bal-label">BALANCE</span><span class="bal-val" id="ui-balance">Rp 5.000.000</span></div>
            <div class="bal-box bg-[#1a1a1a]"><span class="bal-label">TOTAL BET</span><span class="bal-val text-white" id="ui-totalbet">Rp 0</span></div>
        </div>
    </div>
    <!-- Bet area -->
    <div class="bet-area w-[50%] flex flex-col">
        <div class="status-bar" id="status-bar">PLACE YOUR BETS</div>
        <div class="bet-table-wrapper">
            <div class="bet-table-grid">
                <div class="flex gap-1 w-full h-[45%]">
                    <div class="bet-btn border border-[#2b4b8a] rounded-r-sm bg-[#1a233a]/80 flex-[1.1] rounded-bl-sm rounded-tl-[28px]" onmousedown='handleBetClick(event,"playerPair")' oncontextmenu='event.preventDefault()'>
                        <span class="font-bold mb-1 text-xs tracking-wide text-[#5b8cff]">P PAIR</span>
                        <span class="font-bold text-[10px] text-[#4b6cc2]">9:1</span>
                        <div class="chip-display" id="bet-playerPair"></div>
                    </div>
                    <div class="bet-btn border bg-[#1a3020]/80 border-[#235e31] flex-[1.4] rounded-b-sm rounded-t-xl" onmousedown='handleBetClick(event,"tie")' oncontextmenu='event.preventDefault()'>
                        <span class="font-bold tracking-widest text-[13px] mb-1 text-[#3ed168]">TIE</span>
                        <span class="font-bold text-[10px] text-[#32a353]">5:1</span>
                        <div class="chip-display" id="bet-tie"></div>
                    </div>
                    <div class="bet-btn border border-[#8a2b2b] rounded-l-sm bg-[#3a1d1d]/80 flex-[1.1] rounded-br-sm rounded-tr-[28px]" onmousedown='handleBetClick(event,"bankerPair")' oncontextmenu='event.preventDefault()'>
                        <span class="font-bold mb-1 text-xs tracking-wide text-[#ff5b5b]">B PAIR</span>
                        <span class="font-bold text-[10px] text-[#c24b4b]">9:1</span>
                        <div class="chip-display" id="bet-bankerPair"></div>
                    </div>
                </div>
                <div class="flex gap-1 w-full h-[55%]">
                    <div class="flex-col flex-1 bet-btn border bg-[#1a2b4d]/90 border-[#2b4b8a] gap-1 pb-1 rounded-bl-[28px] rounded-r-sm rounded-tl-sm" onmousedown='handleBetClick(event,"player")' oncontextmenu='event.preventDefault()'>
                        <span class="text-[#5b8cff] font-cn leading-none text-3xl">闲</span>
                        <span class="font-bold tracking-widest text-[13px] text-[#5b8cff]">PLAYER</span>
                        <div class="chip-display" id="bet-player"></div>
                    </div>
                    <div class="flex-col flex-1 bet-btn border bg-[#4d1a1a]/90 border-[#8a2b2b] gap-0.5 rounded-br-[28px] rounded-l-sm rounded-tr-sm" onmousedown='handleBetClick(event,"banker")' oncontextmenu='event.preventDefault()'>
                        <span class="text-[#ff5b5b] font-cn leading-none text-3xl">庄</span>
                        <span class="font-bold tracking-widest text-[13px] text-[#ff5b5b]">BANKER</span>
                        <span class="font-bold text-[10px] text-[#c24b4b]">0.95:1</span>
                        <div class="chip-display" id="bet-banker"></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="flex items-center justify-center pb-3 gap-4 w-full z-10">
            <button class="btn-pill clear-btn" onclick="clearBets()" id="clear-btn">CLEAR</button>
            <div class="chip-group" style="padding:6px 12px;gap:8px;">
                <button class="sel-chip active" onclick="selectChip(25e3)"  id="chip-25k">25K</button>
                <button class="sel-chip"        onclick="selectChip(1e5)"   id="chip-100k">100K</button>
                <button class="sel-chip"        onclick="selectChip(5e5)"   id="chip-500k">500K</button>
                <button class="sel-chip"        onclick="selectChip(1e6)"   id="chip-1m">1M</button>
                <button class="sel-chip"        onclick="selectChip(5e6)"   id="chip-5m">5M</button>
                <button class="sel-chip"        onclick="selectChip(1e7)"   id="chip-10m">10M</button>
                <button class="sel-chip all-in-chip" onclick='selectChip("ALL")' id="chip-allin">ALL</button>
            </div>
        </div>
    </div>
    <!-- Roadmap (Big Road) -->
    <div class="w-[32%] roadmap-area">
        <div class="rm-header">
            <div class="rm-stats">
                <span id="stat-total"># 0</span>
                <span><i class="stat-dot dot-p"></i><span id="stat-p">0</span></span>
                <span><i class="stat-dot dot-b"></i><span id="stat-b">0</span></span>
                <span><i class="stat-dot dot-t"></i><span id="stat-t">0</span></span>
            </div>
        </div>
        <div class="rm-grid-container" id="roadmap-grid">
            <div class="rm-grid-lines"></div>
        </div>
    </div>
</div>

<script src="/js/game.js?v=php1"></script>
</body>
</html>
