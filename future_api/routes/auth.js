// sbbs/mods/future_api/routes/auth.js
//
// Auth route for FUTURE_API - verify credentials, return user data
// Location: auth/verify
//
// Input:  { email: "user@example.com", password: "secret", ip: "1.2.3.4" }
// Output: { ok: true, alias: "Username", number: 123, ... } or { ok: false, error: "..." }
//
// SECURITY: Rate limits per email AND per IP to prevent brute force

"use strict";

// Load user settings constants
if (typeof USER_DELETED === "undefined") {
    try { load("sbbsdefs.js"); } catch (e) { }
}
var USER_DELETED_FLAG = (typeof USER_DELETED !== "undefined") ? USER_DELETED : 1;

var ROUTE_NAME = "auth";

// --- Configuration ---
var MAX_ATTEMPTS_PER_EMAIL = 5;
var MAX_ATTEMPTS_PER_IP = 20;
var LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
var LOCKOUT_DURATION_MS = 30 * 60 * 1000;

var rateFile = system.data_dir + "future_api_auth_rate.json";

function loadRateState() {
    var state = { byEmail: {}, byIp: {}, lockedEmails: {}, lockedIps: {} };
    try {
        var f = new File(rateFile);
        if (f.exists && f.open("r")) {
            var data = f.read();
            f.close();
            if (data) state = JSON.parse(data);
        }
    } catch (e) { }
    return state;
}

function saveRateState(state) {
    try {
        var f = new File(rateFile);
        if (f.open("w")) {
            f.write(JSON.stringify(state));
            f.close();
        }
    } catch (e) { }
}

function pruneOldAttempts(attempts, windowMs) {
    var cutoff = Date.now() - windowMs;
    return (attempts || []).filter(function(ts) { return ts > cutoff; });
}

function checkRateLimit(state, email, ip) {
    var now = Date.now();
    var key = email.toLowerCase();
    
    if (state.lockedEmails[key] && state.lockedEmails[key] > now) {
        return { allowed: false, reason: "account_locked", retryAfterMs: state.lockedEmails[key] - now };
    }
    if (ip && state.lockedIps[ip] && state.lockedIps[ip] > now) {
        return { allowed: false, reason: "ip_locked", retryAfterMs: state.lockedIps[ip] - now };
    }
    
    state.byEmail[key] = pruneOldAttempts(state.byEmail[key], LOCKOUT_WINDOW_MS);
    if (ip) state.byIp[ip] = pruneOldAttempts(state.byIp[ip], LOCKOUT_WINDOW_MS);
    
    if ((state.byEmail[key] || []).length >= MAX_ATTEMPTS_PER_EMAIL) {
        state.lockedEmails[key] = now + LOCKOUT_DURATION_MS;
        saveRateState(state);
        return { allowed: false, reason: "too_many_attempts", retryAfterMs: LOCKOUT_DURATION_MS };
    }
    
    if (ip && (state.byIp[ip] || []).length >= MAX_ATTEMPTS_PER_IP) {
        state.lockedIps[ip] = now + LOCKOUT_DURATION_MS;
        saveRateState(state);
        return { allowed: false, reason: "ip_rate_limited", retryAfterMs: LOCKOUT_DURATION_MS };
    }
    
    return { allowed: true };
}

function recordFailedAttempt(state, email, ip) {
    var key = email.toLowerCase();
    if (!state.byEmail[key]) state.byEmail[key] = [];
    state.byEmail[key].push(Date.now());
    if (ip) {
        if (!state.byIp[ip]) state.byIp[ip] = [];
        state.byIp[ip].push(Date.now());
    }
    saveRateState(state);
}

function clearAttempts(state, email) {
    var key = email.toLowerCase();
    delete state.byEmail[key];
    delete state.lockedEmails[key];
    saveRateState(state);
}

// --- Find user by email ---
function findUserByEmail(email) {
    var emailLower = email.toLowerCase();
    for (var i = 1; i <= system.lastuser; i++) {
        try {
            var u = new User(i);
            if (!u || !u.alias) continue;
            if (u.settings & USER_DELETED_FLAG) continue;
            if (u.netmail && u.netmail.toLowerCase() === emailLower) {
                return u;
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

// --- Route handler ---
function handleVerify(ctx, client, packet) {
    var data = packet.data || {};
    var email = String(data.email || "").trim();
    var password = String(data.password || "");
    var ip = data.ip ? String(data.ip) : null;
    
    if (!email || !password) {
        ctx.sendResponse(client, "READ", packet.location, { ok: false, error: "missing_credentials" });
        return;
    }
    
    // Rate limit check
    var state = loadRateState();
    var rateCheck = checkRateLimit(state, email, ip);
    if (!rateCheck.allowed) {
        ctx.sendResponse(client, "READ", packet.location, {
            ok: false,
            error: rateCheck.reason,
            retryAfterMs: rateCheck.retryAfterMs
        });
        return;
    }
    
    // Find user by email
    var usr = findUserByEmail(email);
    if (!usr) {
        recordFailedAttempt(state, email, ip);
        ctx.sendResponse(client, "READ", packet.location, { ok: false, error: "invalid_credentials" });
        return;
    }
    
    // Compare password directly (case-insensitive, like broker.js does)
    var storedPw = usr.security && usr.security.password ? usr.security.password : "";
    if (password.toLowerCase() !== storedPw.toLowerCase()) {
        recordFailedAttempt(state, email, ip);
        var remaining = MAX_ATTEMPTS_PER_EMAIL - ((state.byEmail[email.toLowerCase()] || []).length);
        ctx.sendResponse(client, "READ", packet.location, {
            ok: false,
            error: "invalid_credentials",
            remainingAttempts: Math.max(0, remaining)
        });
        return;
    }
    
    // Success
    clearAttempts(state, email);
    ctx.sendResponse(client, "READ", packet.location, {
        ok: true,
        number: usr.number,
        alias: usr.alias,
        name: usr.name || null,
        level: usr.level,
        location: usr.location || null
    });
}

// --- Route factory ---
function make_auth_route(ctx) {
    return {
        name: ROUTE_NAME,
        match: function(packet) {
            return String(packet.location || "") === "auth/verify";
        },
        handle: function(c, client, packet) {
            handleVerify(c, client, packet);
        }
    };
}
