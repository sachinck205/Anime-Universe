// ==========================================
//  1. CONFIGURATION & INITIALIZATION
// ==========================================

const SUPABASE_URL = 'https://tuepqlmcxwgjcfjemmjs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZXBxbG1jeHdnamNmamVtbWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODkxOTEsImV4cCI6MjA4Mzg2NTE5MX0.yTqNZUiX5cK0E9ifqPvionprphKZ3ZHZkyQwZscjYJA';

// Table Names
const USER_TABLE = 'users';
const MISSION_TABLE = 'missions';

// Initialize Supabase Client
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);


// ==========================================
//  2. AUTHENTICATION (Login / Signup)
// ==========================================

async function dbRegister(userData) {
    const { data: existing } = await db.from(USER_TABLE).select('email').eq('email', userData.email);
    if (existing && existing.length > 0) throw new Error("EMAIL_ALREADY_REGISTERED");

    const { data, error } = await db.from(USER_TABLE).insert([{
        username: userData.username,
        nickname: userData.nickname,
        email: userData.email,
        password: userData.password,
        clan: userData.clan,
        fav_char: userData.favChar,
        level: 1,
        total_xp: 0,
        theme: '#ff4d00'
    }]);

    if (error) throw error;
    return true;
}

async function dbLogin(email, password) {
    const { data, error } = await db.from(USER_TABLE).select('*').eq('email', email).eq('password', password).single();
    if (error || !data) throw new Error("INVALID_CREDENTIALS");
    localStorage.setItem('currentUser', JSON.stringify(data));
    localStorage.setItem('isLoggedIn', 'true');
    return data;
}

async function dbGetUser(email) {
    const { data, error } = await db.from(USER_TABLE).select('*').eq('email', email).single();
    if (error) throw error;
    return data;
}


// ==========================================
//  3. DASHBOARD & PROGRESS
// ==========================================

async function dbUpdateProgress(email, xp, level) {
    await db.from(USER_TABLE).update({ total_xp: xp, level: level }).eq('email', email);
}

async function dbUpdateTheme(email, newTheme) {
    await db.from(USER_TABLE).update({ theme: newTheme }).eq('email', email);
}

async function dbUpdateProfile(email, newNick, newEmail) {
    const { error } = await db.from(USER_TABLE).update({ nickname: newNick, email: newEmail }).eq('email', email);
    if (error) throw error;
}

async function dbUpdatePassword(email, newPassword) {
    const { error } = await db.from(USER_TABLE).update({ password: newPassword }).eq('email', email);
    if (error) throw error;
}

async function dbDeleteAccount(email) {
    await db.from(USER_TABLE).delete().eq('email', email);
    await db.from(MISSION_TABLE).delete().eq('email', email);
    // Also clear friends/messages if they exist
    await db.from('friendships').delete().or(`requester_email.eq.${email},receiver_email.eq.${email}`);
    await db.from('messages').delete().or(`sender_email.eq.${email},receiver_email.eq.${email}`);
}


// ==========================================
//  4. MISSION LOGS
// ==========================================

async function dbGetMissions(email) {
    const { data, error } = await db.from(MISSION_TABLE).select('*').eq('email', email).order('id', { ascending: false });
    if (error) return [];
    return data;
}

async function dbAddMission(missionData) {
    const { data, error } = await db.from(MISSION_TABLE).insert([{
        email: missionData.email,
        title: missionData.title,
        ep: missionData.ep,
        season: missionData.season,
        status: missionData.status
    }]).select();
    if (error) throw error;
    return data[0];
}

async function dbUpdateMission(id, missionData) {
    const { error } = await db.from(MISSION_TABLE).update({
        title: missionData.title,
        ep: missionData.ep,
        season: missionData.season,
        status: missionData.status
    }).eq('id', id);
    if (error) throw error;
}

async function dbDeleteMission(id) {
    const { error } = await db.from(MISSION_TABLE).delete().eq('id', id);
    if (error) throw error;
}


// ==========================================
//  5. SOCIAL NETWORK (UPDATED FOR REQUESTS)
// ==========================================

// SEARCH USERS
async function dbSearchUsers(query) {
    const { data, error } = await db
        .from(USER_TABLE)
        .select('username, nickname, email, clan, level, theme')
        .ilike('username', `%${query}%`)
        .limit(10);
    if (error) return [];
    return data;
}

// SEND RECRUIT SIGNAL (Friend Request)
async function dbSendFriendRequest(myEmail, theirEmail) {
    // 1. Check if already friends
    const { data: isFriend } = await db.from('friends').select('*')
        .match({ user_email: myEmail, friend_email: theirEmail });
    
    if (isFriend && isFriend.length > 0) return { error: "Already Operatives" };

    // 2. Check if request already pending
    const { data: pending } = await db.from('friend_requests').select('*')
        .eq('sender_email', myEmail)
        .eq('receiver_email', theirEmail)
        .eq('status', 'pending');

    if (pending && pending.length > 0) return { error: "Request Pending" };

    // 3. Send Request
    const { error } = await db.from('friend_requests').insert([
        { sender_email: myEmail, receiver_email: theirEmail, status: 'pending' }
    ]);
    
    if (error) return { error: error.message };
    return { success: true };
}

// GET PENDING REQUESTS (For Mailbox)
async function dbGetPendingRequests(myEmail) {
    // Fetch requests sent TO me
    const { data, error } = await db.from('friend_requests')
        .select('*, sender:users!sender_email(username, clan, level)') // Join with user table to get sender info
        .eq('receiver_email', myEmail)
        .eq('status', 'pending');
        
    if(error) { console.log(error); return []; }
    return data;
}

// ACCEPT REQUEST LOGIC
async function dbAcceptRequest(requestId, myEmail, senderEmail) {
    // 1. Update status to 'accepted'
    await db.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);

    // 2. Add to Friends Table (Double Entry for 2-way friendship)
    await db.from('friends').insert([
        { user_email: myEmail, friend_email: senderEmail },
        { user_email: senderEmail, friend_email: myEmail }
    ]);
}

// DECLINE REQUEST LOGIC
async function dbDeclineRequest(requestId) {
    await db.from('friend_requests').update({ status: 'declined' }).eq('id', requestId);
}

// GET MY FRIEND LIST (For Network Page)
async function dbGetFriends(myEmail) {
    // Get all rows where I am the user
    const { data, error } = await db.from('friends').select('friend_email').eq('user_email', myEmail);

    if (error || !data || data.length === 0) return [];
    
    const friendEmails = data.map(f => f.friend_email);
    
    // Get their profile details
    const { data: profiles } = await db.from(USER_TABLE)
        .select('username, nickname, email, clan, level, theme')
        .in('email', friendEmails);
        
    return profiles || [];
}

// SEND PRIVATE MESSAGE
async function dbSendMessage(myEmail, theirEmail, content) {
    const { error } = await db.from('messages').insert([{ sender_email: myEmail, receiver_email: theirEmail, content: content }]);
    if (error) console.error(error);
}

// GET PRIVATE CHAT HISTORY
async function dbGetChatHistory(myEmail, theirEmail) {
    const { data, error } = await db.from('messages').select('*')
        .or(`and(sender_email.eq.${myEmail},receiver_email.eq.${theirEmail}),and(sender_email.eq.${theirEmail},receiver_email.eq.${myEmail})`)
        .order('created_at', { ascending: true })
        .limit(50);

    if (error) return [];
    return data;
}