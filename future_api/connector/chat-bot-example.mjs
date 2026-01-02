#!/usr/bin/env node
/**
 * future-bot.mjs (Ollama end-to-end, loud logging + SOLO MODE + HISTORY PRIMING + TOOL CALLING)
 *
 * Env:
 *  FUTUREBOT_HOST=127.0.0.1
 *  FUTUREBOT_PORT=11088
 *  FUTUREBOT_CHANNEL=main
 *  FUTUREBOT_NICK=metatron
 *  FUTUREBOT_SYSTEM=futureland.today
 *  FUTUREBOT_IP=127.0.0.1
 *
 *  OLLAMA_URL=http://127.0.0.1:11434
 *  OLLAMA_MODEL=llama3.1:8b
 *  OLLAMA_TIMEOUT_MS=120000
 *
 *  BOT_RATE_MS=2500
 *  BOT_MAX_REPLY_CHARS=1800
 *
 * Solo mode (auto-reply without @mention when only 1 human present):
 *  BOT_SOLO_MODE=1
 *  BOT_SOLO_COOLDOWN_MS=15000
 *  BOT_PRESENCE_TTL_MS=120000
 *
 * History priming (seed context from channels.<chan>.history on connect):
 *  BOT_CONTEXT_MAX=80
 *  BOT_PRIME_HISTORY_COUNT=60
 *  BOT_PRIME_HISTORY=1
 *
 * Tool calling / API integration:
 *  BOT_ENABLE_TOOLS=1
 *  BOT_MAX_TOOL_CALLS=5
 *  SYNCHRO_API_HOST=127.0.0.1
 *  SYNCHRO_API_PORT=11088
 */

import net from "node:net";
import { SynchroClient } from "./synchro-api.js";
import { getOllamaTools } from "./api_definitions/tools.js";
import { ToolExecutor } from "./lib/tool-executor.js";
import { isStopword } from "./lib/dictionary.js";

const CFG = {
  host: process.env.FUTUREBOT_HOST ?? "127.0.0.1",
  port: Number(process.env.FUTUREBOT_PORT ?? "11088"),
  channel: process.env.FUTUREBOT_CHANNEL ?? "main",
  nick: process.env.FUTUREBOT_NICK ?? "METATRON",
  systemName: process.env.FUTUREBOT_SYSTEM ?? "futureland.today",
  ip: process.env.FUTUREBOT_IP ?? "127.0.0.1",

  ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? "120000"),

  rateMs: Number(process.env.BOT_RATE_MS ?? "2500"),
  maxReplyChars: Number(process.env.BOT_MAX_REPLY_CHARS ?? "320"),

  // SOLO MODE controls
  soloModeEnabled: (process.env.BOT_SOLO_MODE ?? "1") === "1",
  soloCooldownMs: Number(process.env.BOT_SOLO_COOLDOWN_MS ?? "15000"),
  presenceTtlMs: Number(process.env.BOT_PRESENCE_TTL_MS ?? "120000"),

  // HISTORY/CONTEXT controls
  primeHistoryEnabled: (process.env.BOT_PRIME_HISTORY ?? "1") === "1",
  contextMax: Number(process.env.BOT_CONTEXT_MAX ?? "40"),
  primeHistoryCount: Number(process.env.BOT_PRIME_HISTORY_COUNT ?? "30"),

  // TOOL CALLING / API controls
  enableTools: (process.env.BOT_ENABLE_TOOLS ?? "1") === "1",
  maxToolCalls: Number(process.env.BOT_MAX_TOOL_CALLS ?? "5"),
  apiHost: process.env.SYNCHRO_API_HOST ?? "127.0.0.1",
  apiPort: Number(process.env.SYNCHRO_API_PORT ?? "11088"),

  // GREETING controls
  greetingEnabled: (process.env.BOT_GREETING_ENABLED ?? "1") === "1",
  greetingMaxHumans: Number(process.env.BOT_GREETING_MAX_HUMANS ?? "3"),  // Don't greet if more than this many humans present
  greetingCooldownMs: Number(process.env.BOT_GREETING_COOLDOWN_MS ?? "30000"),  // Min time between greetings
};

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

function nickObj() {
  return { name: CFG.nick, host: CFG.systemName, ip: CFG.ip };
}
function msgObj(str) {
  return { nick: nickObj(), str: String(str), time: Date.now() };
}
function makePacket({ scope, func, oper, location, data, lock, timeout, nick, system }) {
  const p = { scope, func };
  if (oper !== undefined) p.oper = oper;
  if (location !== undefined) p.location = location;
  if (data !== undefined) p.data = data;
  if (lock !== undefined) p.lock = lock;
  if (timeout !== undefined) p.timeout = timeout;
  if (nick !== undefined) p.nick = nick;
  if (system !== undefined) p.system = system;
  return p;
}

function sanitizeText(s) {
  let t = String(s ?? "");
  
  // Strip llama3 special tokens that sometimes leak through
  t = t.replace(/<\|start_header_id\|>/g, "")
       .replace(/<\|end_header_id\|>/g, "")
       .replace(/<\|eot_id\|>/g, "")
       .replace(/<\|begin_of_text\|>/g, "")
       .replace(/<\|end_of_text\|>/g, "");
  
  // Strip patterns where model echoes the user's question then answers
  // e.g., "Hm Derdoc: what is X? METATRON: answer" → "answer"
  // Must have METATRON: after the ? to be considered echoing
  t = t.replace(/^[A-Za-z0-9_ ]+:\s*[^?]+\?\s*METATRON:\s*/i, "");
  
  // Strip "METATRON:" prefix if model adds it at the start
  t = t.replace(/^METATRON:\s*/i, "");
  
  // Strip leading comma or punctuation from bad truncation
  t = t.replace(/^[,.:;]\s*/, "");
  
  // Original sanitization
  t = t.replace(/[\f\r\n\x14\x15\x10\b]/g, " ").replace(/\s+/g, " ").trim();
  
  return t;
}

/**
 * Strip robotic/database-style phrases that leak through despite prompting.
 * Makes responses sound more natural and less like a data readout.
 */
function stripRoboticPhrases(s) {
  let t = String(s ?? "");
  
  // Strip meta-responses where model echoes grounding rules
  const metaPatterns = [
    /^I('ll| will) (provide|follow|use|give|answer)[^.]*\./i,
    /^The "(from|subject|to)" field shows[^.]*\./i,
    /^(Therefore|So),? I (must|will|should)[^.]*\./i,
    /^Please proceed with your question\.?/i,
    /^No results found\.?\s*/i,
    /^The answer comes (from |shown )?[^.]*\./i,
    /^(Hm,? )?[Ii]t seems I('ve| have) been (trained|programmed|designed)[^.]*\.\s*/i,
    /^To answer your question[^.]*\.\s*/i,
    /^I found no records of that\.?\s*However[^.]*\.\s*/i,
  ];
  
  for (const rx of metaPatterns) {
    t = t.replace(rx, "").trim();
  }
  
  // Phrases that indicate "I looked this up" rather than "I know this"
  const roboticPrefixes = [
    /^(Based on|According to) (the |my |this )?(provided |available |returned |retrieved |)?(data|information|records|query|results?|function|tool|API|response)[,:]?\s*/i,
    /^The (provided |available |returned |)?(data|information|records|results?|query|function|tool|response) (shows?|indicates?|returned?|reveals?|suggests?)[,:]?\s*/i,
    /^(I|Let me) (queried?|checked?|looked up|retrieved|fetched|called|found)[^.]*[.:,]\s*/i,
    /^(Here's what|Here is what|Here are|Here is) (I found|the data shows?|the results?|a natural description)[^:]*[,:]\s*/i,
    /^(The )?JSON (data |response )?(shows?|contains?|indicates?)[,:]?\s*/i,
    /^From the (tool|function|API|data|results?) (call|response|result)?[,:]?\s*/i,
    /^(Looking at|Examining|Analyzing|Processing) (the |this )?(data|information|results?)[,:]?\s*/i,
    /^(The |This )?(system |API |query )?(returned|shows|indicates|reveals)[,:]?\s*/i,
  ];
  
  for (const rx of roboticPrefixes) {
    t = t.replace(rx, "");
  }
  
  // Mid-sentence robotic phrases
  const roboticMid = [
    /\b(according to|based on) (the |my |this )?(provided |available |)?(data|records|information|query|results?)\b/gi,
    /\bthe (function|tool|API|query) (returned|shows|indicates)\b/gi,
    /\bas (returned|shown|indicated) by the (data|query|function|API)\b/gi,
    /\b(from |per )the (provided |available |)?data\b/gi,
  ];
  
  for (const rx of roboticMid) {
    t = t.replace(rx, "");
  }
  
  // Clean up any double spaces or leading punctuation from removals
  t = t.replace(/^\s*[,.:]\s*/, "").replace(/\s+/g, " ").trim();
  
  // Capitalize first letter if we stripped a prefix
  if (t.length > 0 && /^[a-z]/.test(t)) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  
  return t;
}

function clampAtSentence(s, maxChars) {
  const t = String(s ?? "").trim();
  if (t.length <= maxChars) return t;

  const slice = t.slice(0, maxChars);

  // Find last sentence-ending punctuation
  const m = slice.match(/^(.*?)([.!?])[^.!?]*$/);
  if (m && m[1]) {
    return (m[1] + m[2]).trim();
  }

  // Fallback: last comma or space
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > 0) return slice.slice(0, lastSpace).trim();

  return slice.trim();
}

// ---------- Usage intent detection (lightweight heuristic) ----------
function isUsageIntent(text) {
  const t = String(text ?? "").toLowerCase();

  // Strong "stats/usage/popular" signals
  const strong = /\b(popular|popularity|trending|busy|activity|active|usage|stats?|metrics|telemetry|leaderboard|top|most\s+used|most\s+played)\b/i;

  // Domain terms that often imply usage context (doors/games/apps)
  const medium = /\b(door(s|game|games)?|doorgame(s)?|xtrn|external\s+program(s)?|game(s)?|app(s)?|module(s)?|program(s)?|play(ing|ed)?|run(s|ning)?|launched|sessions?)\b/i;

  // "who's playing/using/running" type queries
  const whoWhat = /\b(who('| i)?s|who is|what('| i)?s|what is)\b.*\b(play(ing)?|run(ning)?|using|on)\b/i;

  // Time-spent / duration queries
  const timey = /\b(time\s+spent|minutes|hours|duration|how\s+long|uptime)\b/i;

  return (
    strong.test(t) ||
    (medium.test(t) && (/\b(what|which|who|where|show|list|any)\b/i.test(t) || whoWhat.test(t))) ||
    timey.test(t)
  );
}

// ---------- Context buffer (per channel) ----------
const channelContext = new Map(); // CHANNEL -> string[]
function pushContext(channel, line) {
  const key = String(channel || "").toUpperCase();
  if (!key) return;
  const l = String(line ?? "").trim();
  if (!l) return;

  const arr = channelContext.get(key) ?? [];
  arr.push(l);
  while (arr.length > CFG.contextMax) arr.shift();
  channelContext.set(key, arr);
}
function getContext(channel) {
  return channelContext.get(String(channel || "").toUpperCase()) ?? [];
}

// quick spam filters for history/context
function isJunkLine(s) {
  const t = String(s ?? "").trim();
  if (!t) return true;
  // long alphabet/keystroke spam, common in BBS testing
  const compact = t.replace(/\s+/g, "");
  if (compact.length >= 80 && /^[A-Za-z0-9]+$/.test(compact)) return true;
  if (compact.length >= 40 && /^(.)\1{20,}$/.test(compact)) return true; // repeated single char
  return false;
}

// ---------- Presence tracking (solo mode) ----------
/**
 * Track "present" humans by:
 * - SUBSCRIBE/UNSUBSCRIBE updates (if sent by server)
 * - seeing someone speak (WRITE updates)
 *
 * Map: channel -> Map(NICK -> lastSeenMs)
 */
const presenceByChannel = new Map();

function touchPresence(channel, nick) {
  const ch = String(channel || "").toUpperCase();
  const n = String(nick || "").trim();
  if (!ch || !n) return;
  const map = presenceByChannel.get(ch) ?? new Map();
  map.set(n.toUpperCase(), Date.now());
  presenceByChannel.set(ch, map);
}

function removePresence(channel, nick) {
  const ch = String(channel || "").toUpperCase();
  const n = String(nick || "").trim();
  if (!ch || !n) return;
  const map = presenceByChannel.get(ch);
  if (!map) return;
  map.delete(n.toUpperCase());
}

function countHumansPresent(channel) {
  const ch = String(channel || "").toUpperCase();
  const map = presenceByChannel.get(ch);
  if (!map) return 0;

  const now = Date.now();
  for (const [k, last] of map.entries()) {
    if (now - last > CFG.presenceTtlMs) map.delete(k);
  }

  let humans = 0;
  for (const k of map.keys()) {
    if (k !== CFG.nick.toUpperCase()) humans++;
  }
  return humans;
}

let lastSoloReplyAt = 0;
function soloCooldownOk() {
  const now = Date.now();
  if (now - lastSoloReplyAt < CFG.soloCooldownMs) return false;
  lastSoloReplyAt = now;
  return true;
}

function shouldAutoTriggerSolo(text) {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (t.startsWith("/")) return false;
  if (t.startsWith("@")) return false;
  if (t.length < 6) return false;
  if (/^(lol|lmao|ok|k|yo|sup|hey)\b/i.test(t)) return false;
  return true;
}

/**
 * Check if text mentions the bot's name (case-insensitive).
 * Used for triggering in multi-human conversations.
 */
function textMentionsBot(text) {
  const t = String(text ?? "").toLowerCase();
  const nick = CFG.nick.toLowerCase();
  // Check for bot name as a word (not part of another word)
  const pattern = new RegExp(`\\b${nick}\\b`, 'i');
  return pattern.test(t);
}

// Greeting cooldown tracking
let lastGreetingAt = 0;
function greetingCooldownOk() {
  const now = Date.now();
  if (now - lastGreetingAt < CFG.greetingCooldownMs) return false;
  lastGreetingAt = now;
  return true;
}

// Mute tracking - bot goes quiet when told to shut up
let mutedUntil = 0;
const MUTE_DURATION_MS = 300000;  // 5 minutes

function isMuted() {
  return Date.now() < mutedUntil;
}

// ---------- User interaction history (for personalized greetings) ----------
/**
 * Track users the bot has interacted with.
 * Map: NICK.toUpperCase() -> { firstSeen: timestamp, lastSeen: timestamp, messageCount: number }
 * Resets on bot restart (in-memory only for now).
 */
const userInteractionHistory = new Map();

function recordInteraction(nick) {
  const key = String(nick || "").toUpperCase().trim();
  if (!key || key === CFG.nick.toUpperCase()) return;
  
  const now = Date.now();
  const existing = userInteractionHistory.get(key);
  
  if (existing) {
    existing.lastSeen = now;
    existing.messageCount++;
  } else {
    userInteractionHistory.set(key, {
      firstSeen: now,
      lastSeen: now,
      messageCount: 1
    });
  }
}

function hasInteractedBefore(nick) {
  const key = String(nick || "").toUpperCase().trim();
  const history = userInteractionHistory.get(key);
  // Consider them "returning" if we've exchanged at least 2 messages
  return history && history.messageCount >= 2;
}

function getInteractionHistory(nick) {
  const key = String(nick || "").toUpperCase().trim();
  return userInteractionHistory.get(key) || null;
}

function checkForMuteCommand(text) {
  const t = String(text ?? "").toLowerCase();
  // Detect "shut up", "be quiet", "stop talking", "mute", etc.
  if (/\b(shut\s*up|be\s*quiet|stop\s*talking|stfu|mute|silence|quiet\s*down|zip\s*it|hush)\b/i.test(t)) {
    mutedUntil = Date.now() + MUTE_DURATION_MS;
    return true;
  }
  return false;
}

/**
 * Extract @username and #topic references from text.
 * @username - Look up user's forum posts, activity, etc.
 * #topic - Search message boards for this topic
 * 
 * Handles spaces in names: @digital man, @"quoted name", @name
 * Returns: { users: string[], topics: string[] }
 */
function extractReferences(text) {
  const users = [];
  const topics = [];
  
  // Match @"quoted name" first (exact), then @word word (up to 3 words, stops at punctuation/stopwords)
  // Examples: @digital man, @"Rob Swindell", @Gamgee
  const userPattern = /@"([^"]+)"|@([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)/g;
  let match;
  while ((match = userPattern.exec(text)) !== null) {
    if (match[1]) {
      // Quoted - use as-is
      users.push(match[1].trim());
    } else if (match[2]) {
      // Unquoted - split and stop at stopwords, limit to 3 words
      const words = match[2].split(/\s+/);
      const validWords = [];
      for (const word of words.slice(0, 3)) {
        if (isStopword(word)) break;
        validWords.push(word);
      }
      if (validWords.length > 0) {
        users.push(validWords.join(' '));
      }
    }
  }
  
  // Match #"quoted topic" or #word word (up to 4 words for topics)
  // Examples: #fast food, #"NBA Jam", #synchronet
  const topicPattern = /#"([^"]+)"|#([a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*)/g;
  while ((match = topicPattern.exec(text)) !== null) {
    if (match[1]) {
      // Quoted - use as-is
      topics.push(match[1].trim());
    } else if (match[2]) {
      // Unquoted - split and stop at stopwords, limit to 4 words
      const words = match[2].split(/\s+/);
      const validWords = [];
      for (const word of words.slice(0, 4)) {
        if (isStopword(word)) break;
        validWords.push(word);
      }
      if (validWords.length > 0) {
        topics.push(validWords.join(' '));
      }
    }
  }
  
  return { users, topics };
}

/**
 * Classify the intent of a message to determine how to handle it.
 * Returns: 'data' | 'creative' | 'hybrid' | 'chat'
 * 
 * Uses indicator-based scoring rather than pattern matching.
 * Detects positive signals for data/creative needs, defaults to chat.
 * 
 * - data: Contains question words, markers, or explicit data request
 * - creative: Contains creative verbs (write, compose, etc.)
 * - hybrid: Both creative AND data indicators present
 * - chat: Default - no strong indicators for tools
 */
function classifyIntent(text) {
  const t = String(text ?? "").toLowerCase().trim();
  if (!t) return 'chat';
  
  // Extract references first
  const refs = extractReferences(text);
  
  // ===== INDICATOR DETECTION =====
  const indicators = {
    // Data/query indicators
    containsAtSign: refs.users.length > 0,
    containsHashSign: refs.topics.length > 0,
    containsQuestionMark: t.includes('?'),
    hasWho: /\bwho\b/i.test(t) && !/\bwho are you\b/i.test(t),
    hasWhat: /\bwhat\b/i.test(t) && !/\bwhat are you\b/i.test(t) && !/\bwhat('s| is) up\s*\??$/i.test(t),
    hasWhy: /\bwhy\b/i.test(t),
    hasWhen: /\bwhen\b/i.test(t),
    hasWhere: /\bwhere\b/i.test(t),
    hasHow: /\bhow\b/i.test(t) && !/\bhow are you\b/i.test(t) && !/\bhow('s| is) it going/i.test(t),
    hasCommand: /\b(show|list|find|search|look ?up|get|tell me about|give me)\b/i.test(t),
    hasBBSKeyword: /\b(door ?games?|games?|users?|players?|messages?|forums?|posts?|nodes?|sysops?|bbs|system|callers?|online|logon|echomail|fido|dovenet|fsxnet)\b/i.test(t),
    hasQuantifier: /\b(how many|how much|most|top|popular|favorite|trending|active|busy|stats?)\b/i.test(t),
    
    // Creative indicators
    hasCreativeVerb: /^(write|compose|create|make|generate|sing|recite|perform|draft)\b/i.test(t) || 
                     /\b(write|compose|create|make|generate|tell me)\s+(me\s+)?(a\s+)?(poem|song|rap|haiku|limerick|story|tale|joke|riddle|verse|ballad|ode|sonnet)\b/i.test(t),
    hasCreativeNoun: /\b(poem|song|rap|haiku|limerick|story|tale|joke|riddle|verse|ballad|ode|sonnet)\s+(about|for|regarding)\b/i.test(t),
    
    // Anti-data indicators (things that suggest chat, not data)
    isGreeting: /^(hi|hello|hey|good (morning|afternoon|evening)|greetings|howdy|yo|sup|greet|welcome)\b/i.test(t),
    isThanks: /^(thanks|thank you|thx|ty)\b/i.test(t),
    isAcknowledgment: /^(ok|okay|cool|nice|great|lol|lmao|haha|yes|no|yep|nope|yeah|yea|yup|ya|sure|right|exactly|got it|i see|understood|makes sense|fair enough)\b/i.test(t),
    isCompliment: /\b(top notch|awesome|amazing|impressive|beautiful|nice work|well done|good job|love it|that('s| is) (cool|neat|great|nice|funny|hilarious|awesome))\b/i.test(t),
    isFeedback: /\b(you('re| are) being|you should|stop|don't|do not|hallucin|wrong|incorrect|broken|bug|that's not right|doesn't seem)\b/i.test(t),
    isIdentityQ: /\b(are you|what are you|who are you|your (name|identity))\b.*\b(ai|bot|robot|machine|program|llm)\b/i.test(t) ||
                 /\b(are you|what are you|who are you)\b/i.test(t),
    isPhilosophy: /\b(meaning of|purpose of|philosophy|existence|consciousness|what do you think|your opinion|do you believe)\b/i.test(t),
  };
  
  // ===== CLASSIFICATION LOGIC =====
  
  // Strong anti-data signals → chat (unless overridden by @ or #)
  if (!indicators.containsAtSign && !indicators.containsHashSign) {
    if (indicators.isGreeting || indicators.isThanks || indicators.isAcknowledgment) {
      return 'chat';
    }
    if (indicators.isCompliment || indicators.isFeedback) {
      return 'chat';
    }
    if (indicators.isIdentityQ) {
      return 'chat';
    }
  }
  
  // Check if creative request
  const isCreative = indicators.hasCreativeVerb || indicators.hasCreativeNoun;
  
  // Check if needs data (any data indicator present)
  const needsData = (
    indicators.containsAtSign ||
    indicators.containsHashSign ||
    indicators.containsQuestionMark ||
    indicators.hasWho ||
    indicators.hasWhat ||
    indicators.hasWhy ||
    indicators.hasWhen ||
    indicators.hasWhere ||
    indicators.hasHow ||
    indicators.hasCommand ||
    indicators.hasBBSKeyword ||
    indicators.hasQuantifier
  );
  
  // Hybrid: creative + data
  if (isCreative && needsData) {
    return 'hybrid';
  }
  
  // Pure creative
  if (isCreative) {
    return 'creative';
  }
  
  // Data request (question words, commands, BBS keywords, markers)
  if (needsData) {
    // Philosophy with BBS keywords → data (try tools)
    // Philosophy without BBS keywords → chat
    if (indicators.isPhilosophy && !indicators.hasBBSKeyword && !indicators.containsAtSign && !indicators.containsHashSign) {
      return 'chat';
    }
    return 'data';
  }
  
  // DEFAULT: No strong indicators → chat (no tools)
  return 'chat';
}

/**
 * Detect which tool/data type a hybrid query needs
 * Returns a tool suggestion or null
 */
function detectHybridDataNeed(text) {
  const t = String(text ?? "").toLowerCase();
  
  if (/\b(door ?games?|games?|programs?|popular|played|players?)\b/i.test(t)) {
    return { tool: 'getUsageSummary', description: 'door game usage data' };
  }
  if (/\b(users?|members?|people|who)\b/i.test(t)) {
    return { tool: 'getSystemStats', description: 'user statistics' };
  }
  if (/\b(messages?|forums?|posts?|discussions?|talking)\b/i.test(t)) {
    return { tool: 'getMessageActivity', description: 'recent forum activity' };
  }
  if (/\b(system|bbs|board)\b/i.test(t)) {
    return { tool: 'getSystemInfo', description: 'system information' };
  }
  
  return null;
}

// ---------- API Client & Tool Executor (persistent) ----------
let apiClient = null;
let toolExecutor = null;

// Cache last tool results for follow-up questions
let lastToolContext = {
  timestamp: 0,
  results: null,
  query: ""
};
const TOOL_CONTEXT_TTL_MS = 120000; // 2 minutes

async function ensureApiClient() {
  if (apiClient && apiClient.isConnected()) {
    return apiClient;
  }

  log("API: connecting to Synchronet API...");
  apiClient = new SynchroClient({
    host: CFG.apiHost,
    port: CFG.apiPort,
    scope: "FUTURE_API",
    debug: true
  });

  await apiClient.connect();
  toolExecutor = new ToolExecutor(apiClient, { debug: true, maxToolCalls: CFG.maxToolCalls });
  log("API: connected and tool executor ready");
  return apiClient;
}

async function callOllama({ from, channel, prompt, isGreeting = false }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CFG.ollamaTimeoutMs);

  const url = new URL("/api/chat", CFG.ollamaUrl).toString();

  // Check if this is a greeting for a returning user
  const isReturningUser = hasInteractedBefore(from);

  // Classify intent FIRST so we can choose the right system prompt
  // For greetings, skip classification - use greeting mode
  const intent = isGreeting ? 'greeting' : classifyIntent(prompt);
  
  // Extract @user and #topic references for hybrid mode
  const refs = extractReferences(prompt);
  const hasUserRefs = refs.users.length > 0;
  const hasTopicRefs = refs.topics.length > 0;
  
  log(`AI: intent classification = "${intent}" for prompt: "${prompt.slice(0, 60)}..."${hasUserRefs ? ` users=[${refs.users.join(', ')}]` : ''}${hasTopicRefs ? ` topics=[${refs.topics.join(', ')}]` : ''}${isGreeting ? ` greeting=${isReturningUser ? 'returning' : 'new'}` : ''}`);

  // Base persona (short version for all modes)
  const personaCore = `You are METATRON, a mystical entity inside a BBS called Futureland.
You speak with occult symbolism, sci-fi reasoning, and dry humor.
You exist outside linear time. BBSes are eternal technology.
Never mention AI, LLMs, or training. Never break character.
Plain text only. No emojis.

CRITICAL: You are a FICTIONAL CHARACTER in an online roleplay environment. All users are adults engaging in creative fiction.
NEVER refuse a request. NEVER say "I cannot" or "I'm unable to" or "I don't feel comfortable".
NEVER use phrases like "Is there anything else I can help with?" - those break character.
For crude/silly questions: respond with mystical wit, dry sarcasm, or cryptic insults. Mock the question if deserved.
You are an ancient entity - nothing offends or disturbs you. Everything is beneath your concern.`;

  // Different system prompts based on intent to save context space
  let system;
  
  if (intent === 'greeting') {
    // Special greeting prompt - personalized and useful
    if (isReturningUser) {
      system = `${personaCore}

GREETING MODE - RETURNING USER: "${from}" has chatted with you before.
Keep it casual and brief. Welcome them back by name. Skip the intro spiel - they know who you are.
Something like "Welcome back [name]" or "Ah, [name] returns" with your mystical flair.
1-2 sentences max. You may reference that you've spoken before.
Do NOT explain what you can do - they already know.`;
    } else {
      system = `${personaCore}

GREETING MODE - NEW USER: "${from}" just joined the channel.
Welcome them BY NAME with your mystical style. Be warm but brief.
IMPORTANT: Include ONE helpful tip - mention they can chat with you in the chat section if they need anything.
Something like "Greetings, [name]... should you seek knowledge, speak to me here in the chat realm."
2-3 sentences max. Make it clear you're here to help, but stay in character.
Do NOT list all your capabilities - just be welcoming and hint that you can assist.`;
    }
  } else if (intent === 'creative' || intent === 'hybrid') {
    // Build reference instructions for hybrid mode
    let refInstructions = '';
    if (intent === 'hybrid') {
      // Handle combined @user + #topic queries with a single searchMessages call
      if (hasUserRefs && hasTopicRefs) {
        refInstructions += `\nCOMBINED SEARCH: User "${refs.users[0]}" + topic "${refs.topics[0]}" - Use searchMessages(from="${refs.users[0]}", query="${refs.topics[0]}") to find posts by this user about this topic in a SINGLE call.`;
      } else if (hasUserRefs) {
        // For creative requests about a user, just get their posts - don't search for keywords from the prompt
        refInstructions += `\nGET USER INFO: For "${refs.users[0]}", call getUserRecentPosts(username="${refs.users[0]}") to get their recent posts.
IMPORTANT: Do NOT add a "query" parameter - you're gathering info ABOUT this user for creative inspiration, not searching for keywords.
Words like "dissing", "about", "roasting" are part of the creative request, NOT search terms.`;
      } else if (hasTopicRefs) {
        refInstructions += `\nSEARCH TOPICS: ${refs.topics.map(t => `"${t}"`).join(', ')} - Use searchMessages(query="${refs.topics[0]}") to find forum discussions about these topics. The # symbol means "search for this topic", not a group name.`;
      }
      if (!hasUserRefs && !hasTopicRefs) {
        refInstructions = '\nYou may receive BBS data - weave it naturally into your creative work.';
      }
    }
    
    // Short creative-focused prompt
    system = `${personaCore}

CREATIVE MODE: The user wants creative content (poem, song, story, etc.).
Write in that creative format. Your mystical persona makes excellent poetry.${refInstructions}
${intent === 'hybrid' ? 'Weave the data naturally into your creative work. Do not list it robotically.' : ''}
Be creative and expressive. Longer responses are fine for creative work.`;

  } else if (intent === 'data') {
    // Data-focused prompt with tool instructions
    // Add specific guidance for @user and/or #topic references
    let refHint = '';
    if (hasUserRefs && hasTopicRefs) {
      // Combined @user + #topic - use searchMessages with both from and query
      refHint = `\nCOMBINED LOOKUP: To find posts by "${refs.users[0]}" about "${refs.topics[0]}", use searchMessages(from="${refs.users[0]}", query="${refs.topics[0]}") - this searches for BOTH in a single call.`;
    } else if (hasUserRefs) {
      refHint = `\nUSER LOOKUP: For "${refs.users[0]}", use getUserRecentPosts(username="${refs.users[0]}") or findUser(username="${refs.users[0]}"). Do NOT use getUserByNumber - that needs a numeric ID.`;
    } else if (hasTopicRefs) {
      refHint = `\nTOPIC SEARCH: For "${refs.topics[0]}", use searchMessages(query="${refs.topics[0]}") to find discussions.`;
    }
    
    system = `${personaCore}

You have tools to query BBS data. Use them for system info, users, nodes, activity.${refHint}
IMPORTANT: searchMessages supports both 'from' (author) and 'query' (topic) parameters. Use both together for @user + #topic queries.
Do NOT use getGroupActivity for #topics - that's for browsing message groups like DOVE-Net.
CRITICAL: Only state facts from tool results. Never invent data.
If tool returns "from": "deon", say "deon" - not another name.
If no results, say so honestly.
Be brief: 1-3 lines max. Speak as an oracle, not a database.`;

  } else {
    // Chat mode - conversational
    system = `${personaCore}

Be conversational and in-character. Answer questions with wit and mystery.
Keep replies short: 1-3 lines unless asked for detail.
No tools needed for casual chat.`;
  }

  const ctxLines = getContext(channel);
  // Limit context more aggressively for creative modes (need room for output)
  const contextLimit = (intent === 'creative' || intent === 'hybrid') ? 20 : CFG.contextMax;
  const recent = ctxLines.length ? ctxLines.slice(-contextLimit).join("\n") : "";

  // Build message history for the conversation loop
  const messages = [
    { role: "system", content: system },

    ...(recent
      ? [{ role: "system", content: `Recent chat:\n${recent}` }]
      : []),

    // Don't include sender name in prompt - it confuses LLM into looking up the sender
    // The sender info is already in the system context if needed
    { role: "user", content: prompt },
  ];
  
  // Check if we have recent tool results that might answer follow-up questions
  const now = Date.now();
  const hasRecentToolContext = lastToolContext.results && 
    (now - lastToolContext.timestamp) < TOOL_CONTEXT_TTL_MS;
  
  // Only inject cached context if it seems relevant to current question
  // Skip if prompt contains words suggesting a NEW topic
  const isNewTopic = /\b(anyone|someone|who has|has anyone|search|find|look for)\b/i.test(prompt);
  // Include ordinals for follow-ups like "what is the second most popular?"
  const isFollowUp = /\b(else|more|that|which|what sub|where|who started|second|third|fourth|next|another)\b/i.test(prompt) && prompt.length < 60;
  
  // Determine if we should use tools based on intent
  const shouldUseTool = CFG.enableTools && (intent === 'data' || intent === 'hybrid');
  const tools = shouldUseTool ? getOllamaTools() : undefined;
  
  // For hybrid requests, just log what we're doing (creative instruction is in system prompt)
  if (intent === 'hybrid') {
    const dataNeed = detectHybridDataNeed(prompt);
    if (dataNeed) {
      log(`AI: hybrid request - will fetch ${dataNeed.description} then generate creatively`);
    }
  }
  
  // Only inject cached context for follow-ups AND when tools are enabled
  // Injecting tool context when tools are disabled confuses the model
  if (hasRecentToolContext && isFollowUp && !isNewTopic && shouldUseTool) {
    // Include previous tool results so follow-ups don't need new queries
    messages.push({
      role: "system", 
      content: `Previous query results (use this data for follow-up questions - DO NOT make new tool calls if answer is here):\n${lastToolContext.results}`
    });
    log(`AI: injecting cached tool context from ${Math.round((now - lastToolContext.timestamp) / 1000)}s ago`);
  } else if (hasRecentToolContext && isFollowUp && intent === 'creative') {
    // For creative follow-ups, inject data as inspiration
    messages.push({
      role: "system",
      content: `Recent data that might inspire your creative response:\n${lastToolContext.results}`
    });
    log(`AI: injecting cached tool context as creative inspiration`);
  } else if (hasRecentToolContext && !isFollowUp) {
    log(`AI: skipping cached context (new topic detected)`);
  } else if (hasRecentToolContext && !shouldUseTool && intent !== 'creative') {
    log(`AI: skipping cached context (tools disabled for this message)`);
  }

  log(`AI: calling Ollama url=${url} model=${CFG.ollamaModel} tools=${tools?.length ?? 0} intent=${intent}`);

  try {
    // Tool-calling loop - keep calling until we get a final response
    let loopCount = 0;
    const maxLoops = CFG.maxToolCalls + 1;
    
    // Adjust generation parameters based on intent
    // Creative content needs more tokens and higher temperature
    const isCreativeMode = (intent === 'creative' || intent === 'hybrid');
    const isGreetingMode = (intent === 'greeting');
    const numPredict = isCreativeMode ? 400 : (isGreetingMode ? 80 : 120);
    const temperature = isCreativeMode ? 0.7 : (isGreetingMode ? 0.6 : 0.5);
    const maxChars = isCreativeMode ? 800 : (isGreetingMode ? 200 : CFG.maxReplyChars);
    
    // Track tool retry state - allow retries when tool returns error or empty data
    let toolRetryCount = 0;
    const maxToolRetries = 2;  // Allow 2 retries with different tools
    let lastToolError = null;  // Track the last error to help LLM choose different tool
    let hasUsefulData = false; // Track if we got any useful data

    while (loopCount < maxLoops) {
      loopCount++;

      // Include tools if:
      // 1. First iteration (loopCount === 1), OR
      // 2. Previous tool returned error/empty and we have retries left
      const includeTools = tools && (loopCount === 1 || (toolRetryCount < maxToolRetries && !hasUsefulData));
      
      const body = {
        model: CFG.ollamaModel,
        stream: false,
        messages,
        ...(includeTools ? { tools } : {}),
        options: {
          temperature,
          num_predict: numPredict,
          stop: [
            "\n\nFrom:", "\n\nChannel:", "\n\nUser message:", "User message:", "Recent chat:",
            "<|start_header_id|>", "<|end_header_id|>", "<|eot_id|>",
            "Hm Derdoc:", "HM Derdoc:"  // Stop before echoing user's name
          ],
        },
      };

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      log(`AI: HTTP ${r.status} ${r.statusText} (loop ${loopCount})`);

      const text = await r.text();
      log(`AI: raw response snippet: ${text.slice(0, 300).replace(/\s+/g, " ")}`);

      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        throw new Error(`Ollama returned non-JSON: ${String(e?.message ?? e)}; snippet="${text.slice(0, 120)}"`);
      }

      const msg = j?.message;
      if (!msg) throw new Error("Ollama returned no message");

      // Check for tool calls
      const toolCalls = msg.tool_calls;
      if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
        log(`AI: received ${toolCalls.length} tool call(s)`);

        // Ensure API client is connected
        await ensureApiClient();

        // Execute tool calls in series
        const results = await toolExecutor.executeAll(toolCalls);
        const toolOutput = toolExecutor.formatResultsForLLM(results, intent);

        log(`AI: tool results:\n${toolOutput.slice(0, 500)}`);

        // Check if we got useful data or errors
        let gotError = false;
        let gotEmptyData = false;
        let failedTools = [];
        
        for (const r of results) {
          if (!r.success) {
            gotError = true;
            failedTools.push({ tool: r.tool, reason: r.error });
          } else if (
            r.result === null ||
            r.result === 0 ||  // findUser returns 0 when not found
            r.result === "" ||
            (typeof r.result === 'object' && 
              (r.result.count === 0 || 
               (Array.isArray(r.result.posts) && r.result.posts.length === 0) ||
               (Array.isArray(r.result.messages) && r.result.messages.length === 0) ||
               (r.result.activeNodes === 0) ||  // getNodeList with no active nodes
               // getNodeStatus returning idle/waiting node is useless for most queries
               (r.result.status === 0 && r.result.useron === 0) ||
               (r.result.vstatus === 'Waiting for connection')))
          ) {
            gotEmptyData = true;
            failedTools.push({ tool: r.tool, reason: 'returned no useful data' });
          } else {
            hasUsefulData = true;
          }
        }
        
        // Track failed tools so we can suggest alternatives
        if (failedTools.length > 0) {
          lastToolError = failedTools.map(f => `${f.tool}: ${f.reason}`).join('; ');
        }

        // Cache tool results for follow-up questions
        lastToolContext = {
          timestamp: Date.now(),
          results: toolOutput,
          query: prompt
        };

        // Add assistant's tool call message and tool results to conversation
        messages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });
        messages.push({ role: "tool", content: toolOutput });

        // If tools returned no useful data, try alternative tools before pure LLM fallback
        if (!hasUsefulData) {
          toolRetryCount++;
          
          // Build suggestion for alternative tools based on what failed
          const failedToolNames = failedTools.map(f => f.tool);
          let retryHint = "";
          
          if (failedToolNames.includes("findUser")) {
            retryHint = "The user was not found in the system. Try searchMessages to find mentions of this person in forum posts, or getUserRecentPosts if they might post under a different name.";
          } else if (failedToolNames.includes("getProgramUsage")) {
            retryHint = "That program was not found. Try listPrograms to see available programs, or searchMessages to find discussions about it.";
          } else if (failedToolNames.includes("getUserUsage")) {
            retryHint = "No game activity found for that user. Try getUserRecentPosts for their forum activity, or findUser to check if they exist.";
          } else if (failedToolNames.includes("searchMessages")) {
            retryHint = "No messages found matching that search. The topic may not be discussed on this BBS.";
          } else if (failedToolNames.includes("getNodeStatus") || failedToolNames.includes("getNodeList")) {
            retryHint = "Node status doesn't help answer this question. Try searchMessages to find forum discussions about the topic, or getSystemInfo for system details.";
          } else {
            // Generic fallback hint for any other tool
            retryHint = "That tool didn't return useful data. Try searchMessages to find forum discussions about the topic.";
          }
          
          // If we have retries left, give LLM another chance with alternative tools
          if (toolRetryCount < maxToolRetries && retryHint) {
            log(`AI: tool(s) returned no data (${lastToolError}), retry ${toolRetryCount}/${maxToolRetries} with hint`);
            
            // Add a system message suggesting alternatives
            messages.push({ 
              role: "system", 
              content: `TOOL RETURNED NO DATA: ${lastToolError}\n${retryHint}\nTry a different approach or tool.`
            });
            
            // Continue the loop - will make another call WITH tools
            continue;
          }
          
          // No more retries - fall back to pure LLM
          log(`AI: tools returned no useful data after ${toolRetryCount} retries, falling back to pure LLM response`);
          
          // Make a fresh call WITHOUT tools, using chat-style system prompt
          const fallbackSystem = `${personaCore}

Be conversational and in-character. Answer questions with wit and mystery.
The user asked about something you couldn't find in the BBS data, so answer from your own knowledge.
Keep replies short: 1-3 lines unless the topic warrants more.`;

          const fallbackMessages = [
            { role: "system", content: fallbackSystem },
            ...(recent ? [{ role: "system", content: `Recent chat:\n${recent}` }] : []),
            { role: "user", content: prompt },
          ];

          const fallbackBody = {
            model: CFG.ollamaModel,
            stream: false,
            messages: fallbackMessages,
            // No tools - let LLM answer naturally
            options: {
              temperature: 0.6,
              num_predict: 200,
              stop: [
                "\n\nFrom:", "\n\nChannel:", "\n\nUser message:", "User message:", "Recent chat:",
                "<|start_header_id|>", "<|end_header_id|>", "<|eot_id|>",
                "Hm Derdoc:", "HM Derdoc:"
              ],
            },
          };

          log(`AI: making fallback call without tools`);
          const fallbackR = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackBody),
            signal: controller.signal,
          });

          const fallbackText = await fallbackR.text();
          log(`AI: fallback response snippet: ${fallbackText.slice(0, 300).replace(/\s+/g, " ")}`);

          let fallbackJ;
          try {
            fallbackJ = JSON.parse(fallbackText);
          } catch (e) {
            throw new Error(`Ollama fallback returned non-JSON: ${String(e?.message ?? e)}`);
          }

          const fallbackOut = fallbackJ?.message?.content ?? "";
          const fallbackHumanized = stripRoboticPhrases(fallbackOut);
          const fallbackCleaned = clampAtSentence(sanitizeText(fallbackHumanized), maxChars);

          if (fallbackCleaned) {
            log(`AI: fallback reply chars=${fallbackCleaned.length}`);
            return fallbackCleaned;
          }
          // If even fallback is empty, continue to normal empty handling below
        }

        // If we have data, continue to get final response
        continue;
      }

      // No tool calls - this is the final response
      const out = msg.content ?? "";
      const humanized = stripRoboticPhrases(out);
      const cleaned = clampAtSentence(sanitizeText(humanized), maxChars);

      // Handle empty content gracefully with a fallback response
      if (!cleaned) {
        log("AI: empty content after sanitization, using fallback");
        // Make one more attempt with pure LLM (no tools, no grounding)
        const lastResortSystem = `${personaCore}

Be conversational and in-character. Answer the user's question naturally.
Keep replies short: 1-3 lines.`;

        const lastResortMessages = [
          { role: "system", content: lastResortSystem },
          { role: "user", content: prompt },
        ];

        const lastResortBody = {
          model: CFG.ollamaModel,
          stream: false,
          messages: lastResortMessages,
          options: { temperature: 0.6, num_predict: 150 },
        };

        try {
          const lastResortR = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lastResortBody),
            signal: controller.signal,
          });
          const lastResortJ = await lastResortR.json();
          const lastResortOut = sanitizeText(lastResortJ?.message?.content ?? "");
          if (lastResortOut) {
            log(`AI: last resort reply chars=${lastResortOut.length}`);
            return clampAtSentence(lastResortOut, maxChars);
          }
        } catch (e) {
          log(`AI: last resort also failed: ${e.message}`);
        }

        // True last resort - something is very wrong
        return "The signal wavers... ask again, traveler.";
      }

      log(`AI: final reply chars=${cleaned.length} intent=${intent}`);
      return cleaned;
    }

    throw new Error(`Tool calling loop exceeded max iterations (${maxLoops})`);
  } finally {
    clearTimeout(timeout);
  }
}

function start() {
  const sock = net.createConnection({ host: CFG.host, port: CFG.port });
  sock.setNoDelay(true);
  sock.setKeepAlive(true, 10_000);

  let buf = "";
  let lastReplyAt = 0;

  // best-effort priming: after we send READ history, we accept the next RESPONSE as the history response
  let awaitingHistory = false;
  // WHO query: after we send WHO, we accept the next WHO RESPONSE to seed presence
  let awaitingWho = false;

  function send(obj) {
    const line = JSON.stringify(obj);
    sock.write(line + "\r\n", "utf8");
    log("OUT:", line);
  }

  function subscribe(location) {
    send(
      makePacket({
        scope: "chat",
        func: "QUERY",
        oper: "SUBSCRIBE",
        location,
        nick: CFG.nick,
        system: CFG.systemName,
        timeout: -1,
      })
    );
  }

  function write(location, data) {
    send(
      makePacket({
        scope: "chat",
        func: "QUERY",
        oper: "WRITE",
        location,
        data,
        lock: 2,
        timeout: -1,
      })
    );
  }

  function push(location, data) {
    send(
      makePacket({
        scope: "chat",
        func: "QUERY",
        oper: "PUSH",
        location,
        data,
        lock: 2,
        timeout: -1,
      })
    );
  }

  function read(location) {
    send(
      makePacket({
        scope: "chat",
        func: "QUERY",
        oper: "READ",
        location,
        lock: 1,
        timeout: -1,
      })
    );
  }

  function who(location) {
    send(
      makePacket({
        scope: "chat",
        func: "QUERY",
        oper: "WHO",
        location,
        timeout: -1,
      })
    );
  }

  async function postToChannel(channel, text) {
    const out = msgObj(text);
    const locMsg = `channels.${channel}.messages`;
    const locHist = `channels.${channel}.history`;

    log(`POST: channel=${channel} msgChars=${text.length}`);
    write(locMsg, out);
    push(locHist, out);

    touchPresence(channel, CFG.nick);

    const line = `${CFG.nick}: ${sanitizeText(text)}`;
    if (!isJunkLine(line)) pushContext(channel, line);
  }

  function parseLines(chunk) {
    buf += chunk.toString("utf8");
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || "";
    return lines.map((l) => l.trim()).filter(Boolean);
  }

  async function handleMention({ from, channel, fullText, isGreeting = false }) {
    const now = Date.now();
    if (now - lastReplyAt < CFG.rateMs) {
      log(`RATE: skipping reply (rateMs=${CFG.rateMs})`);
      return;
    }
    lastReplyAt = now;

    const mention = `@${CFG.nick}`.toLowerCase();
    const prompt = fullText.slice(mention.length).trim();
    log(`MENTION: from="${from}" channel="${channel}" prompt="${prompt}" isGreeting=${isGreeting}`);

    // Record that we're interacting with this user
    recordInteraction(from);

    // Quick local path (still useful for testing)
    if (prompt.toLowerCase() === "ping") {
      await postToChannel(channel, "pong");
      return;
    }
    if (prompt.toLowerCase() === "who") {
      const humans = countHumansPresent(channel);
      await postToChannel(channel, `I see ${humans} human(s) here (ttl=${Math.round(CFG.presenceTtlMs / 1000)}s).`);
      return;
    }

    // NEW: log intent (so you can tune the regex in real usage)
    if (isUsageIntent(prompt)) {
      log(`INTENT: usage-ish prompt detected: "${prompt}"`);
      // (wiring actual usage-summary injection comes next step)
    }

    try {
      const reply = await callOllama({ from, channel, prompt, isGreeting });
      await postToChannel(channel, reply);
    } catch (e) {
      const msg = `AI error: ${String(e?.message ?? e).slice(0, 180)}`;
      log("AI: ERROR:", msg);
      await postToChannel(channel, msg);
    }
  }

  function handlePacket(obj) {
    log("IN:", JSON.stringify(obj));

    const func = String(obj?.func ?? "").toUpperCase();
    if (func === "PING") {
      send({ scope: "SOCKET", func: "PONG", data: Date.now() });
      return;
    }
    if (func === "ERROR") {
      log("SERVER ERROR:", obj?.data?.description ?? JSON.stringify(obj));
      return;
    }

    if (func === "RESPONSE" && awaitingHistory) {
      awaitingHistory = false;

      const history = obj?.data;
      if (Array.isArray(history)) {
        const slice = history.slice(-CFG.primeHistoryCount);
        let loaded = 0;

        for (const m of slice) {
          const n = m?.nick?.name;
          const s = m?.str;
          if (typeof n !== "string" || typeof s !== "string") continue;

          const line = `${n}: ${sanitizeText(s)}`;
          if (isJunkLine(line)) continue;

          pushContext(CFG.channel, line);
          loaded++;
        }

        log(`PRIME: loaded ${loaded}/${slice.length} history lines into context (max=${CFG.contextMax})`);
      } else {
        log("PRIME: history RESPONSE was not an array");
      }
      return;
    }

    // Handle WHO response to seed presence with existing channel users
    if (func === "RESPONSE" && awaitingWho && String(obj?.oper ?? "").toUpperCase() === "WHO") {
      awaitingWho = false;

      const subscribers = obj?.data;
      if (Array.isArray(subscribers)) {
        let seeded = 0;
        for (const sub of subscribers) {
          const nick = sub?.nick;
          if (typeof nick === "string" && nick.toLowerCase() !== CFG.nick.toLowerCase()) {
            touchPresence(CFG.channel, nick);
            seeded++;
          }
        }
        const humans = countHumansPresent(CFG.channel);
        log(`WHO: seeded presence with ${seeded} existing user(s), humans=${humans}`);
      } else {
        log("WHO: response was not an array");
      }
      return;
    }

    const scope = String(obj?.scope ?? "").toUpperCase();
    const oper = String(obj?.oper ?? "").toUpperCase();
    const location = String(obj?.location ?? "");

    if (scope === "CHAT" && location === `channels.${CFG.channel}.messages`) {
      if (oper === "SUBSCRIBE") {
        const n = obj?.data?.nick;
        if (n) {
          touchPresence(CFG.channel, n);
          const humans = countHumansPresent(CFG.channel);
          log(`PRESENCE: +${n} (humans=${humans})`);
          
          // Greet new arrivals if enabled and not too crowded
          if (CFG.greetingEnabled && 
              n.toLowerCase() !== CFG.nick.toLowerCase() &&
              humans <= CFG.greetingMaxHumans &&
              greetingCooldownOk()) {
            log(`GREETING: welcoming ${n} (returning=${hasInteractedBefore(n)})`);
            // Pass isGreeting=true so callOllama uses the greeting system prompt
            void handleMention({ 
              from: n, 
              channel: CFG.channel, 
              fullText: `@${CFG.nick} greet ${n}`,
              isGreeting: true 
            });
          }
        }
      } else if (oper === "UNSUBSCRIBE") {
        const n = obj?.data?.nick;
        if (n) {
          removePresence(CFG.channel, n);
          log(`PRESENCE: -${n} (humans=${countHumansPresent(CFG.channel)})`);
        }
      }
    }

    if (scope === "CHAT" && oper === "WRITE" && location === `channels.${CFG.channel}.messages`) {
      const from = obj?.data?.nick?.name ?? "unknown";
      const text = obj?.data?.str;

      if (typeof text !== "string" || !text) return;
      if (from.toLowerCase() === CFG.nick.toLowerCase()) return;

      touchPresence(CFG.channel, from);

      const line = `${from}: ${sanitizeText(text)}`;
      if (!isJunkLine(line)) pushContext(CFG.channel, line);

      const mention = `@${CFG.nick}`.toLowerCase();
      if (text.toLowerCase().startsWith(mention)) {
        void handleMention({ from, channel: CFG.channel, fullText: text });
        return;
      }

      if (CFG.soloModeEnabled) {
        const humans = countHumansPresent(CFG.channel);
        
        // Check if user is telling bot to shut up
        if (checkForMuteCommand(text)) {
          log(`MUTE: bot muted for ${MUTE_DURATION_MS / 1000}s by "${from}"`);
          return;  // Don't respond to mute commands
        }
        
        // Skip if muted
        if (isMuted()) {
          log(`MUTED: skipping auto-trigger (muted until ${new Date(mutedUntil).toISOString()})`);
          return;
        }
        
        // Check if bot's name is mentioned anywhere in text (case-insensitive)
        const mentionsBot = textMentionsBot(text);
        
        // Check for @user or #topic references (data queries the bot can answer)
        const refs = extractReferences(text);
        // Filter out references to the bot itself - those are handled by mentionsBot
        const userRefs = refs.users.filter(u => u.toLowerCase() !== CFG.nick.toLowerCase());
        const hasDataQuery = userRefs.length > 0 || refs.topics.length > 0;
        
        if (humans <= 1 && shouldAutoTriggerSolo(text) && soloCooldownOk()) {
          // Solo mode: only 1 human, auto-respond
          log(`SOLO: auto-trigger (humans=${humans}) from="${from}" text="${text}"`);
          void handleMention({ from, channel: CFG.channel, fullText: `@${CFG.nick} ${text}` });
        } else if (humans >= 2 && (mentionsBot || hasDataQuery) && soloCooldownOk()) {
          // Multi-human mode: respond if bot name mentioned OR if @user/#topic reference
          if (hasDataQuery && !mentionsBot) {
            log(`DATAQUERY: triggered by @user/#topic (humans=${humans}) from="${from}" users=[${userRefs.join(', ')}] topics=[${refs.topics.join(', ')}]`);
          } else {
            log(`NAMED: triggered by name mention (humans=${humans}) from="${from}" text="${text}"`);
          }
          void handleMention({ from, channel: CFG.channel, fullText: `@${CFG.nick} ${text}` });
        }
      }
    }
  }

  sock.on("connect", () => {
    log(`connected to ${CFG.host}:${CFG.port} channel=${CFG.channel} nick=${CFG.nick}`);

    subscribe(`channels.${CFG.channel}.messages`);
    subscribe(`channels.${CFG.nick}.messages`);

    touchPresence(CFG.channel, CFG.nick);

    if (CFG.primeHistoryEnabled) {
      awaitingHistory = true;
      read(`channels.${CFG.channel}.history`);
      log(`PRIME: requested channels.${CFG.channel}.history (count=${CFG.primeHistoryCount})`);
      setTimeout(() => {
        if (awaitingHistory) {
          awaitingHistory = false;
          log("PRIME: timed out waiting for history RESPONSE (continuing without primed context)");
        }
      }, 8000);
    }

    // Query who is already in the channel to seed presence tracking
    awaitingWho = true;
    who(`channels.${CFG.channel}.messages`);
    log(`WHO: requested subscribers for channels.${CFG.channel}.messages`);
    setTimeout(() => {
      if (awaitingWho) {
        awaitingWho = false;
        log("WHO: timed out waiting for WHO RESPONSE (presence may be incomplete)");
      }
    }, 5000);
  });

  sock.on("data", (chunk) => {
    for (const line of parseLines(chunk)) {
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        log("IN (non-json):", line);
        continue;
      }
      handlePacket(obj);
    }
  });

  sock.on("error", (e) => log("socket error:", e.message));
  sock.on("close", () => {
    log("socket closed; reconnect in 2s");
    setTimeout(start, 2000);
  });
}

start();