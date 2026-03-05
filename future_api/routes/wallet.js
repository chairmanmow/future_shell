// sbbs/mods/future_api/routes/wallet.js
//
// Wallet linking API for FUTURE_API
// Allows linking blockchain wallets to BBS accounts
//
// Endpoints:
//   wallet/challenge        (POST) - Create a challenge token for wallet linking
//   wallet/challenge/:token (GET)  - Fetch challenge details for web landing page
//   wallet/link             (POST) - Store wallet link after signature verification
//   wallet/user/:user       (GET)  - Get user's linked wallets
//   wallet/unlink           (POST) - Remove a wallet link
//   wallet/owner/:addr      (GET)  - Check who owns a wallet address
//
// Storage: data/wallet_links.json

"use strict";

var ROUTE_NAME = "wallet";
var WALLET_FILE = system.data_dir + "wallet_links.json";
var CHALLENGE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
var CHALLENGE_MESSAGE_PREFIX = "Link wallet to BBS account: ";

// --- Storage helpers ---

function loadWalletData() {
	var data = {
		byUser: {},      // username -> [{ address, chain, linkedAt, signature }]
		byWallet: {},    // address -> { username, chain, linkedAt }
		pending: {}      // token -> { username, challenge, createdAt, expiresAt }
	};
	try {
		var f = new File(WALLET_FILE);
		if (f.exists && f.open("r")) {
			var content = f.read();
			f.close();
			if (content) {
				var parsed = JSON.parse(content);
				if (parsed.byUser) data.byUser = parsed.byUser;
				if (parsed.byWallet) data.byWallet = parsed.byWallet;
				if (parsed.pending) data.pending = parsed.pending;
			}
		}
	} catch (e) {
		log(LOG_WARNING, "wallet.js: loadWalletData error: " + e);
	}
	return data;
}

function saveWalletData(data) {
	try {
		var f = new File(WALLET_FILE);
		if (f.open("w")) {
			f.write(JSON.stringify(data, null, 2));
			f.close();
			return true;
		}
	} catch (e) {
		log(LOG_WARNING, "wallet.js: saveWalletData error: " + e);
	}
	return false;
}

// --- Token generation ---

function generateToken(length) {
	var chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
	var token = "";
	for (var i = 0; i < (length || 32); i++) {
		token += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return token;
}

function generateChallenge(username, nonce) {
	// Challenge message that user signs with their wallet
	return CHALLENGE_MESSAGE_PREFIX + username + " [" + nonce + "]";
}

// --- Cleanup expired pending challenges ---

function cleanupExpired(data) {
	var now = Date.now();
	var cleaned = false;
	for (var token in data.pending) {
		if (data.pending.hasOwnProperty(token)) {
			if (data.pending[token].expiresAt < now) {
				delete data.pending[token];
				cleaned = true;
			}
		}
	}
	return cleaned;
}

// --- Ethereum address validation ---

function isValidEthAddress(address) {
	if (!address || typeof address !== "string") return false;
	// Basic check: 0x followed by 40 hex characters
	return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function normalizeAddress(address) {
	if (!address) return "";
	return String(address).toLowerCase();
}

// --- User lookup ---

function userExists(username) {
	if (!username) return false;
	var usernameLower = username.toLowerCase();
	for (var i = 1; i <= system.lastuser; i++) {
		try {
			var u = new User(i);
			if (!u || !u.alias) continue;
			if (u.alias.toLowerCase() === usernameLower) {
				return true;
			}
		} catch (e) {
			continue;
		}
	}
	return false;
}

// --- Route handlers ---

/**
 * POST wallet/challenge
 * Create a challenge token for wallet linking
 * Input: { username: "alias" }
 * Output: { ok: true, token: "...", challenge: "...", expiresAt: 123456789 }
 */
function handleChallenge(ctx, client, packet) {
	var input = packet.data || {};
	var username = String(input.username || "").trim();
	
	if (!username) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "missing_username" });
		return;
	}
	
	// Verify user exists
	if (!userExists(username)) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "user_not_found" });
		return;
	}
	
	var data = loadWalletData();
	cleanupExpired(data);
	
	var now = Date.now();
	var token = generateToken(8);
	var nonce = generateToken(8);
	var challenge = generateChallenge(username, nonce);
	var expiresAt = now + CHALLENGE_EXPIRY_MS;
	
	data.pending[token] = {
		username: username,
		challenge: challenge,
		nonce: nonce,
		createdAt: now,
		expiresAt: expiresAt
	};
	
	if (!saveWalletData(data)) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "storage_error" });
		return;
	}
	
	ctx.sendResponse(client, "WRITE", packet.location, {
		ok: true,
		token: token,
		challenge: challenge,
		expiresAt: expiresAt
	});
}

/**
 * POST wallet/link
 * Store wallet link after signature verification
 * 
 * Two modes:
 * 1. Token-based (BBS-generated challenge):
 *    Input: { token: "...", address: "0x...", signature: "0x...", chain: "ethereum" }
 * 
 * 2. Direct (Node.js verified - signature already checked by ethers.js):
 *    Input: { username: "...", wallet: "0x...", signature: "0x...", nonce: "..." }
 *    
 * Output: { ok: true, username: "...", wallets: [...] }
 */
function handleLink(ctx, client, packet) {
	var input = packet.data || {};
	
	// Support both "address" and "wallet" field names
	var address = String(input.address || input.wallet || "").trim();
	var signature = String(input.signature || "").trim();
	var chain = String(input.chain || "ethereum").toLowerCase();
	var token = String(input.token || "").trim();
	var username = String(input.username || "").trim();
	var nonce = String(input.nonce || "").trim();
	
	// Determine which mode we're in
	var useDirectMode = !token && username;
	
	if (!address) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "missing_address" });
		return;
	}
	
	if (!isValidEthAddress(address)) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "invalid_address" });
		return;
	}
	
	var data = loadWalletData();
	cleanupExpired(data);
	
	if (useDirectMode) {
		// Direct mode: Node.js has already verified the signature
		// We just need to verify the user exists and store the link
		
		if (!username) {
			ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "missing_username" });
			return;
		}
		
		// Verify user exists
		if (!userExists(username)) {
			ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "user_not_found" });
			return;
		}
		
		log(LOG_INFO, "wallet.js: Direct link mode - username=" + username + ", wallet=" + address);
		
	} else {
		// Token mode: Look up pending challenge
		if (!token) {
			ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "missing_token_or_username" });
			return;
		}
		
		var pending = data.pending[token];
		if (!pending) {
			ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "invalid_or_expired_token" });
			return;
		}
		
		if (pending.expiresAt < Date.now()) {
			delete data.pending[token];
			saveWalletData(data);
			ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "token_expired" });
			return;
		}
		
		username = pending.username;
		
		// Remove from pending
		delete data.pending[token];
	}
	
	var normalizedAddr = normalizeAddress(address);
	
	// Check if wallet is already linked to another user
	if (data.byWallet[normalizedAddr]) {
		var existingOwner = data.byWallet[normalizedAddr].username;
		if (existingOwner.toLowerCase() !== username.toLowerCase()) {
			ctx.sendResponse(client, "WRITE", packet.location, {
				ok: false,
				error: "wallet_already_linked",
				owner: existingOwner
			});
			return;
		}
		// Already linked to same user - just update
	}
	
	// Merge any wallets stored under different case variants into lowercase key
	var userKeyForMerge = username.toLowerCase();
	for (var existingKey in data.byUser) {
		if (data.byUser.hasOwnProperty(existingKey) && existingKey !== userKeyForMerge && existingKey.toLowerCase() === userKeyForMerge) {
			// Migrate wallets from old case-variant key to lowercase key
			if (!data.byUser[userKeyForMerge]) data.byUser[userKeyForMerge] = [];
			var oldWallets = data.byUser[existingKey];
			for (var wi = 0; wi < oldWallets.length; wi++) {
				data.byUser[userKeyForMerge].push(oldWallets[wi]);
			}
			delete data.byUser[existingKey];
			log(LOG_INFO, "wallet.js: Migrated wallets from key '" + existingKey + "' to '" + userKeyForMerge + "'");
		}
	}
	
	// Create the link
	var now = Date.now();
	var linkRecord = {
		address: normalizedAddr,
		chain: chain,
		linkedAt: now,
		signature: signature
	};
	
	if (nonce) {
		linkRecord.nonce = nonce;
	}
	
	// Normalize username key to lowercase for consistent storage
	var userKey = username.toLowerCase();
	
	// Add to byUser
	if (!data.byUser[userKey]) {
		data.byUser[userKey] = [];
	}
	
	// Remove existing entry for this address if present
	data.byUser[userKey] = data.byUser[userKey].filter(function(w) {
		return w.address !== normalizedAddr;
	});
	data.byUser[userKey].push(linkRecord);
	
	// Add to byWallet (store display-case username for lookups)
	data.byWallet[normalizedAddr] = {
		username: username,
		chain: chain,
		linkedAt: now
	};
	
	if (!saveWalletData(data)) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "storage_error" });
		return;
	}
	
	log(LOG_INFO, "wallet.js: Linked wallet " + normalizedAddr + " to user " + username);
	
	// Return response with wallets array as expected
	ctx.sendResponse(client, "WRITE", packet.location, {
		ok: true,
		username: username,
		address: normalizedAddr,
		chain: chain,
		linkedAt: now,
		wallets: data.byUser[userKey]
	});
}

/**
 * GET wallet/user/:username
 * Get user's linked wallets
 * Input: { username: "alias" } in location or data
 * Output: { ok: true, wallets: [...] }
 */
function handleGetUserWallets(ctx, client, packet) {
	var input = packet.data || {};
	var location = String(packet.location || "");
	
	// Extract username from location (wallet/user/username) or data
	var username = input.username;
	if (!username) {
		var parts = location.split("/");
		if (parts.length >= 3 && parts[0] === "wallet" && parts[1] === "user") {
			username = decodeURIComponent(parts[2]);
		}
	}
	
	if (!username) {
		ctx.sendResponse(client, "READ", packet.location, { ok: false, error: "missing_username" });
		return;
	}
	
	var data = loadWalletData();
	
	// Case-insensitive lookup - merge ALL case variants
	var usernameLower = username.toLowerCase();
	var wallets = [];
	for (var key in data.byUser) {
		if (data.byUser.hasOwnProperty(key) && key.toLowerCase() === usernameLower) {
			var keyWallets = data.byUser[key];
			for (var i = 0; i < keyWallets.length; i++) {
				wallets.push(keyWallets[i]);
			}
		}
	}
	
	ctx.sendResponse(client, "READ", packet.location, {
		ok: true,
		username: username,
		wallets: wallets,
		count: wallets.length
	});
}

/**
 * POST wallet/unlink
 * Remove a wallet link
 * Input: { username: "alias", address: "0x..." } or { username: "alias", wallet: "0x..." }
 * Output: { ok: true, wallets: [...] }
 */
function handleUnlink(ctx, client, packet) {
	var input = packet.data || {};
	var username = String(input.username || "").trim();
	var address = String(input.address || input.wallet || "").trim();
	
	if (!username || !address) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "missing_parameters" });
		return;
	}
	
	var normalizedAddr = normalizeAddress(address);
	var data = loadWalletData();
	
	// Check ownership
	if (!data.byWallet[normalizedAddr]) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "wallet_not_linked" });
		return;
	}
	
	if (data.byWallet[normalizedAddr].username.toLowerCase() !== username.toLowerCase()) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "not_owner" });
		return;
	}
	
	// Remove from byWallet
	delete data.byWallet[normalizedAddr];
	
	// Remove from byUser (use lowercase key)
	var userKey = username.toLowerCase();
	if (data.byUser[userKey]) {
		data.byUser[userKey] = data.byUser[userKey].filter(function(w) {
			return w.address !== normalizedAddr;
		});
		if (data.byUser[userKey].length === 0) {
			delete data.byUser[userKey];
		}
	}
	
	if (!saveWalletData(data)) {
		ctx.sendResponse(client, "WRITE", packet.location, { ok: false, error: "storage_error" });
		return;
	}
	
	log(LOG_INFO, "wallet.js: Unlinked wallet " + normalizedAddr + " from user " + username);
	
	ctx.sendResponse(client, "WRITE", packet.location, {
		ok: true,
		wallets: data.byUser[userKey] || []
	});
}

/**
 * GET wallet/owner/:address
 * Check who owns a wallet address
 * Output: { ok: true, owned: true/false, username: "..." }
 */
function handleGetOwner(ctx, client, packet) {
	var input = packet.data || {};
	var location = String(packet.location || "");
	
	// Extract address from location (wallet/owner/0x...) or data
	var address = input.address;
	if (!address) {
		var parts = location.split("/");
		if (parts.length >= 3 && parts[0] === "wallet" && parts[1] === "owner") {
			address = decodeURIComponent(parts[2]);
		}
	}
	
	if (!address) {
		ctx.sendResponse(client, "READ", packet.location, { ok: false, error: "missing_address" });
		return;
	}
	
	var normalizedAddr = normalizeAddress(address);
	var data = loadWalletData();
	var record = data.byWallet[normalizedAddr];
	
	if (record) {
		ctx.sendResponse(client, "READ", packet.location, {
			ok: true,
			owned: true,
			username: record.username,
			chain: record.chain,
			linkedAt: record.linkedAt
		});
	} else {
		ctx.sendResponse(client, "READ", packet.location, {
			ok: true,
			owned: false
		});
	}
}

/**
 * GET wallet/challenge/:token
 * Fetch challenge details for a pending token (used by web landing page)
 * Output: { ok: true, username: "...", challenge: "...", expiresAt: 123456789 }
 */
function handleGetChallenge(ctx, client, packet) {
	var loc = String(packet.location || "");
	var parts = loc.split("/");
	var token = "";
	if (parts.length >= 3 && parts[0] === "wallet" && parts[1] === "challenge") {
		token = decodeURIComponent(parts[2]);
	}

	if (!token) {
		ctx.sendResponse(client, "READ", packet.location, { ok: false, error: "missing_token" });
		return;
	}

	var data = loadWalletData();
	cleanupExpired(data);

	var pending = data.pending[token];
	if (!pending) {
		ctx.sendResponse(client, "READ", packet.location, { ok: false, error: "invalid_or_expired_token" });
		return;
	}

	if (pending.expiresAt < Date.now()) {
		delete data.pending[token];
		saveWalletData(data);
		ctx.sendResponse(client, "READ", packet.location, { ok: false, error: "token_expired" });
		return;
	}

	ctx.sendResponse(client, "READ", packet.location, {
		ok: true,
		token: token,
		username: pending.username,
		challenge: pending.challenge,
		expiresAt: pending.expiresAt
	});
}

// --- Route matcher ---

function matchWalletRoute(packet) {
	var loc = String(packet.location || "");
	if (!loc.match(/^wallet\//)) return false;
	
	// Match specific endpoints
	if (loc === "wallet/challenge") return true;
	if (loc.match(/^wallet\/challenge\/.+$/)) return true;
	if (loc === "wallet/link") return true;
	if (loc === "wallet/unlink") return true;
	if (loc.match(/^wallet\/user\/.+$/)) return true;
	if (loc.match(/^wallet\/owner\/.+$/)) return true;
	
	return false;
}

// --- Route handler dispatcher ---

function handleWallet(ctx, client, packet) {
	var loc = String(packet.location || "");
	var oper = String(packet.oper || "READ").toUpperCase();
	
	ctx.dlog("wallet route: " + loc + " oper=" + oper);
	
	// POST wallet/challenge - Create challenge
	if (loc === "wallet/challenge" && oper === "WRITE") {
		handleChallenge(ctx, client, packet);
		return;
	}

	// GET wallet/challenge/:token - Fetch challenge details
	if (loc.match(/^wallet\/challenge\/.+$/) && oper === "READ") {
		handleGetChallenge(ctx, client, packet);
		return;
	}
	
	// POST wallet/link - Link wallet
	if (loc === "wallet/link" && oper === "WRITE") {
		handleLink(ctx, client, packet);
		return;
	}
	
	// POST wallet/unlink - Unlink wallet
	if (loc === "wallet/unlink" && oper === "WRITE") {
		handleUnlink(ctx, client, packet);
		return;
	}
	
	// GET wallet/user/:username - Get user wallets
	if (loc.match(/^wallet\/user\/.+$/) && oper === "READ") {
		handleGetUserWallets(ctx, client, packet);
		return;
	}
	
	// GET wallet/owner/:address - Get wallet owner
	if (loc.match(/^wallet\/owner\/.+$/) && oper === "READ") {
		handleGetOwner(ctx, client, packet);
		return;
	}
	
	// Unknown endpoint
	ctx.sendError(client, loc, "unknown_wallet_endpoint");
}

// --- Route factory ---

function make_wallet_route(ctx) {
	return {
		name: ROUTE_NAME,
		match: matchWalletRoute,
		handle: handleWallet
	};
}
