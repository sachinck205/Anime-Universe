document.addEventListener('DOMContentLoaded', async function() {
    
    // ==========================================
    // 1.  MAKE PAGE VISIBLE (CRITICAL FIX)
    // ==========================================
    // We run this FIRST so the buttons appear immediately.
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
    });
    document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));


    // ==========================================
    // 2. CONFIGURATION
    // ==========================================
    const SUPABASE_URL = 'https://tuepqlmcxwgjcfjemmjs.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZXBxbG1jeHdnamNmamVtbWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODkxOTEsImV4cCI6MjA4Mzg2NTE5MX0.yTqNZUiX5cK0E9ifqPvionprphKZ3ZHZkyQwZscjYJA';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let channel;
    let currentUser = null;

    // UI Elements
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const profileBtn = document.getElementById('profile-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    const userCountEl = document.getElementById('user-count');
    const activeUnitsList = document.getElementById('active-units-list');
    const statActiveUsers = document.getElementById('stat-active-users');
    const statLatency = document.getElementById('stat-latency');
    const chatForm = document.getElementById('pro-chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');


    // ==========================================
    // 3. AUTHENTICATION (LOCAL STORAGE METHOD)
    // ==========================================
    
    function checkAuth() {
        // We strictly check LocalStorage to match your anime-db.js logic
        const storedUser = localStorage.getItem('currentUser');
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

        if (isLoggedIn && storedUser) {
            try {
                currentUser = JSON.parse(storedUser);
                console.log("✅ User found in storage:", currentUser.email);
                updateAuthUI(true);
                connectToArena(); // Connect to chat/active users
            } catch (e) {
                console.error("Error parsing user data:", e);
                updateAuthUI(false);
            }
        } else {
            console.log("❌ No user logged in");
            updateAuthUI(false);
        }
    }

    function updateAuthUI(isLoggedIn) {
        if (isLoggedIn) {
            // Logged In: Show Profile/Logout
            if(loginBtn) loginBtn.classList.add('hidden');
            if(signupBtn) signupBtn.classList.add('hidden');
            if(profileBtn) profileBtn.classList.remove('hidden');
            if(logoutBtn) logoutBtn.classList.remove('hidden');
        } else {
            // Logged Out: Show Login/Join
            if(loginBtn) loginBtn.classList.remove('hidden');
            if(signupBtn) signupBtn.classList.remove('hidden');
            if(profileBtn) profileBtn.classList.add('hidden');
            if(logoutBtn) logoutBtn.classList.add('hidden');
        }
    }

    // Logout Handler
    if(logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('currentUser');
            localStorage.setItem('isLoggedIn', 'false');
            window.location.reload();
        });
    }


    // ==========================================
    // 4. WEEB ARENA (REALTIME PRESENCE)
    // ==========================================
    function connectToArena() {
        if (channel) return;

        channel = supabase.channel('weeb-arena');

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();
                const users = [];
                for (let id in newState) {
                    users.push(...newState[id]);
                }
                updateArenaUI(users);
            })
            .on('broadcast', { event: 'chat' }, (payload) => {
                // Receive message from others
                appendMessage(payload.payload.message, payload.payload.sender, false);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Send my details to the room
                    await channel.track({
                        user_id: currentUser.id || 'unknown',
                        email: currentUser.email || 'unknown',
                        nickname: currentUser.nickname || 'Operative',
                        online_at: new Date().toISOString()
                    });
                }
            });
    }

    function updateArenaUI(users) {
        const count = users.length;
        
        // Update Numbers
        if(userCountEl) {
            userCountEl.textContent = `STATUS: ${count} UNIT${count !== 1 ? 'S' : ''} DEPLOYED`;
            userCountEl.style.color = '#ff4d00';
        }
        if(statActiveUsers) statActiveUsers.textContent = count.toString().padStart(2, '0');

        // Update List
        if(activeUnitsList) {
            activeUnitsList.innerHTML = users.map((u, i) => {
                const isMe = currentUser && u.email === currentUser.email; // Match by email since IDs might differ
                const color = isMe ? 'bg-green-500' : 'bg-blue-500';
                const name = isMe ? 'You (Commander)' : (u.nickname || `Operative ${i+1}`);
                
                return `
                    <div class="flex items-center gap-3 text-sm p-1 animate-pulse">
                        <div class="w-2 h-2 rounded-full ${color} shadow-[0_0_8px_currentColor]"></div>
                        <span class="${isMe ? 'text-white font-bold' : 'text-gray-400'} font-mono">${name}</span>
                    </div>
                `;
            }).join('');
        }
    }


    // ==========================================
    // 5. CHAT SYSTEM
    // ==========================================
    if(chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            
            if (!text) return;
            if (!currentUser) {
                alert("Login required to transmit data.");
                return;
            }

            // 1. Show my message locally
            appendMessage(text, "You", true);

            // 2. Send to others
            if(channel) {
                await channel.send({
                    type: 'broadcast',
                    event: 'chat',
                    payload: { 
                        message: text, 
                        sender: currentUser.nickname || "Operative" 
                    }
                });
            }
            chatInput.value = '';
        });
    }

    function appendMessage(text, sender, isMe) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const html = isMe ? `
            <div class="flex flex-col items-end mb-2 animate-slide-in-right">
                <span class="text-[10px] text-action font-bold uppercase mb-1">You</span>
                <div class="bg-action text-black text-xs font-bold p-3 max-w-[80%] action-skew shadow-lg">
                    ${text}
                </div>
                <span class="text-[9px] text-gray-600 mt-1">${time}</span>
            </div>
        ` : `
             <div class="flex flex-col items-start mb-2 animate-slide-in">
                <span class="text-[10px] text-gray-500 font-bold uppercase mb-1">${sender}</span>
                <div class="bg-white/10 border-l-2 border-white text-gray-200 text-xs p-3 max-w-[80%]">
                    ${text}
                </div>
                <span class="text-[9px] text-gray-600 mt-1">${time}</span>
            </div>
        `;

        if(chatMessages) {
            chatMessages.insertAdjacentHTML('beforeend', html);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }


    // ==========================================
    // 6. EXTRAS (Visuals & Audio)
    // ==========================================
    
    // Latency Simulation
    setInterval(() => {
        if(statLatency) statLatency.textContent = Math.floor(Math.random() * 30 + 15) + " ms";
    }, 2000);

    // Particles Canvas
    const canvas = document.getElementById('hero-particles');
    if(canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize);
        resize();
        
        for(let i=0; i<50; i++) particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2,
            speed: Math.random() * 1 + 0.5
        });

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.y -= p.speed;
                if(p.y < 0) p.y = canvas.height;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 77, 0, 0.5)';
                ctx.fill();
            });
            requestAnimationFrame(animate);
        }
        animate();
    }

    // Audio SFX
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playBeep() {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(1000, audioCtx.currentTime); 
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    }
    document.querySelectorAll('button, a, .card').forEach(el => el.addEventListener('mouseenter', playBeep));

    // Tilt Effect
    document.querySelectorAll('.tilt-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width/2;
            const y = e.clientY - rect.top - rect.height/2;
            card.style.transform = `perspective(1000px) rotateX(${-y/10}deg) rotateY(${x/10}deg) scale3d(1.05, 1.05, 1.05)`;
        });
        card.addEventListener('mouseleave', () => card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)');
    });

    // Quote Generator
    const quotesDB = [
        { text: "If you don't take risks, you can't create a future.", char: "Monkey D. Luffy", anime: "One Piece" },
        { text: "Hard work betrays none, but dreams betray many.", char: "Hachiman Hikigaya", anime: "Oregairu" },
        { text: "The only ones who should kill, are those who are prepared to be killed.", char: "Lelouch Vi Britannia", anime: "Code Geass" },
        { text: "Fear is not evil. It tells you what your weakness is.", char: "Gildarts Clive", anime: "Fairy Tail" }
    ];

    const newQuoteBtn = document.getElementById('new-quote-btn');
    if(newQuoteBtn) {
        newQuoteBtn.addEventListener('click', () => {
            const display = document.getElementById('quote-display');
            display.classList.add('fade-out');
            setTimeout(() => {
                const random = Math.floor(Math.random() * quotesDB.length);
                const q = quotesDB[random];
                document.getElementById('q-text').textContent = `"${q.text}"`;
                document.getElementById('q-char').textContent = q.char;
                document.getElementById('q-anime').textContent = q.anime;
                display.classList.remove('fade-out');
            }, 300);
        });
    }

    const copyQuoteBtn = document.getElementById('copy-quote-btn');
    if(copyQuoteBtn) {
        copyQuoteBtn.addEventListener('click', () => {
            const text = document.getElementById('q-text').textContent;
            const char = document.getElementById('q-char').textContent;
            navigator.clipboard.writeText(`${text} - ${char} (Anime Universe)`).then(() => alert("Intel Copied!"));
        });
    }

    // --- 7. RUN INITIAL CHECK ---
    checkAuth();
});