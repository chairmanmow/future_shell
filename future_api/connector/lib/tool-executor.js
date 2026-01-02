// lib/tool-executor.js
//
// Executes tool calls via SynchroClient.
// Handles path parameter substitution and data parameter mapping.

import { getToolByName, getHumanHint } from "../api_definitions/tools.js";

// Fields that are Unix timestamps (seconds since 1970) - convert to readable dates
// Note: lastActive and lastTimestamp from usage data are in MILLISECONDS
const TIMESTAMP_FIELDS = new Set([
  "logontime", "firston_date", "laston_date", "new_file_time",
  "compiled_when", "git_time", "time", "created", "modified", "last_modified",
  "date", "when_written_time", "when_imported_time"
]);

// Millisecond timestamps (usage data uses ms, not seconds)
const TIMESTAMP_MS_FIELDS = new Set([
  "lastActive", "lastTimestamp"
]);

// Fields that are durations in seconds - convert to readable duration
const DURATION_FIELDS = new Set([
  "total_timeon", "timeon_today", "timeon_last_logon", "seconds"
]);

// Fields that are durations in minutes - note this for LLM
const DURATION_MINUTES_FIELDS = new Set([
  "time_per_logon", "time_per_day"
]);

// Only include these fields when sending to LLM (per-tool pruning)
// This prevents overwhelming the LLM with irrelevant data
const RELEVANT_FIELDS = {
  getSystemInfo: ["name", "operator", "operator_available", "location", "inet_addr", 
                  "version", "full_version", "nodes", "platform", "uptime", "timezone", "tz_offset"],
  getSystemStats: ["total_users", "total_logons", "logons_today", "total_messages", 
                   "messages_posted_today", "total_files", "new_users_today"],
  getNodeList: ["status", "vstatus", "useron", "action", "activity"],
  getNodeStatus: ["status", "vstatus", "useron", "action", "activity", "connection"],
  getUserByNumber: ["alias", "name", "location", "logontime", "age", "gender", 
                    "connection", "note", "comment", "is_sysop"],
  getUserStats: ["total_logons", "firston_date", "laston_date", "total_timeon",
                 "total_posts", "total_emails", "files_uploaded", "files_downloaded"],
  getServerInfo: ["version", "clients"],
  findUser: null, // Return as-is (just a number)
  
  // Usage tools - return most relevant fields for natural responses
  getUsageSummary: ["latestMonth", "monthsCount", "allTimeTotals", "latest"],
  getUserUsage: ["userName", "totals", "favoriteProgram", "topPrograms", "lastActive", "queriedAs", "matchedName"],
  getProgramUsage: ["programId", "programLabel", "totals", "topPlayers", "lastActive", "queriedAs", "matchedId"],
  getMonthlyUsage: null, // Custom handling - see pruneMonthlyUsage
  listPrograms: ["count", "programs"],
};

/**
 * Custom pruning for monthly usage - limit to top 5 programs and users
 */
function pruneMonthlyUsage(obj) {
  const result = {
    totals: obj.totals || { count: 0, seconds: 0 }
  };

  // Convert programs object to sorted array, take top 5
  if (obj.programs && typeof obj.programs === "object") {
    const progArr = Object.entries(obj.programs)
      .map(([id, p]) => ({ programId: id, ...p }))
      .sort((a, b) => (b.seconds || 0) - (a.seconds || 0))
      .slice(0, 5);
    result.topPrograms = progArr;
  }

  // Convert users object to sorted array, take top 5
  if (obj.users && typeof obj.users === "object") {
    const userArr = Object.entries(obj.users)
      .map(([name, u]) => ({ userName: u.alias || name, ...u }))
      .sort((a, b) => (b.seconds || 0) - (a.seconds || 0))
      .slice(0, 5);
    result.topUsers = userArr;
  }

  return result;
}

/**
 * Limit array fields to top N items
 */
function limitArrays(obj, maxItems = 5) {
  if (!obj || typeof obj !== "object") return obj;
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      result[key] = value.slice(0, maxItems);
    } else if (typeof value === "object" && value !== null) {
      result[key] = limitArrays(value, maxItems);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Custom pruning for usage summary - limit nested arrays
 */
function pruneUsageSummary(obj) {
  const result = {
    latestMonth: obj.latestMonth,
    monthsCount: obj.monthsCount,
    allTimeTotals: obj.allTimeTotals
  };
  
  if (obj.latest) {
    result.latest = {
      month: obj.latest.month,
      totals: obj.latest.totals,
      topPrograms: (obj.latest.topPrograms || []).slice(0, 5),
      topUsers: (obj.latest.topUsers || []).slice(0, 5)
    };
  }
  
  return result;
}

/**
 * Custom pruning for user usage - limit topPrograms
 */
function pruneUserUsage(obj) {
  return {
    userName: obj.userName,
    userNumber: obj.userNumber,
    totals: obj.totals,
    favoriteProgram: obj.favoriteProgram,
    topPrograms: (obj.topPrograms || []).slice(0, 5),
    lastActive: obj.lastActive,
    queriedAs: obj.queriedAs,
    matchedName: obj.matchedName
  };
}

/**
 * Custom pruning for program usage - limit topPlayers  
 */
function pruneProgramUsage(obj) {
  return {
    programId: obj.programId,
    programLabel: obj.programLabel,
    totals: obj.totals,
    topPlayers: (obj.topPlayers || []).slice(0, 5),
    lastActive: obj.lastActive,
    queriedAs: obj.queriedAs,
    matchedId: obj.matchedId
  };
}

/**
 * Custom pruning for program list - limit to top 15
 */
function pruneListPrograms(obj) {
  return {
    count: obj.count,
    programs: (obj.programs || []).slice(0, 15).map(p => ({
      programId: p.programId,
      label: p.label,
      seconds: p.seconds
    }))
  };
}

/**
 * Custom pruning for message area summary - limit nested arrays
 */
function pruneMessageSummary(obj) {
  return {
    groupCount: obj.groupCount,
    subCount: obj.subCount,
    totalPosts: obj.totalPosts,
    groups: (obj.groups || []).slice(0, 5).map(g => ({
      name: g.name,
      subCount: g.subCount,
      totalPosts: g.totalPosts
    }))
  };
}

/**
 * Custom pruning for message sub list - limit to top 15
 */
function pruneListSubs(obj) {
  return {
    count: obj.count,
    subs: (obj.subs || []).slice(0, 15).map(s => ({
      code: s.code,
      name: s.name,
      posts: s.posts
    }))
  };
}

/**
 * Custom pruning for message activity - limit messages
 */
function pruneMessageActivity(obj) {
  return {
    count: obj.count,
    messages: (obj.messages || []).slice(0, 15).map(m => ({
      subName: m.subName,
      from: m.from,
      subject: m.subject,
      date: m.date,
      body: m.body
    }))
  };
}

/**
 * Custom pruning for sub recent messages - limit and simplify
 */
function pruneSubRecent(obj) {
  return {
    subCode: obj.subCode,
    subName: obj.subName,
    count: obj.count,
    messages: (obj.messages || []).slice(0, 15).map(m => ({
      from: m.from,
      to: m.to,
      subject: m.subject,
      date: m.date,
      body: m.body
    }))
  };
}

/**
 * Custom pruning for user posts - limit and simplify
 */
function pruneUserPosts(obj) {
  return {
    user: obj.user,
    count: obj.count,
    posts: (obj.posts || []).slice(0, 15).map(p => ({
      subName: p.subName,
      subject: p.subject,
      date: p.date,
      body: p.body
    }))
  };
}

/**
 * Custom pruning for search results - limit and simplify
 */
function pruneSearchResults(obj) {
  return {
    query: obj.query,
    from: obj.from,
    count: obj.count,
    messages: (obj.messages || []).slice(0, 15).map(m => ({
      subName: m.subName,
      from: m.from,
      subject: m.subject,
      date: m.date,
      body: m.body
    }))
  };
}

/**
 * Custom pruning for file area summary - limit nested arrays
 */
function pruneFileAreaSummary(obj) {
  return {
    libCount: obj.libCount,
    dirCount: obj.dirCount,
    totalFiles: obj.totalFiles,
    libs: (obj.libs || []).slice(0, 10).map(l => ({
      name: l.name,
      dirCount: l.dirCount,
      totalFiles: l.totalFiles
    }))
  };
}

/**
 * Custom pruning for file directory list - limit to top 15
 */
function pruneListDirs(obj) {
  return {
    count: obj.count,
    dirs: (obj.dirs || []).slice(0, 15).map(d => ({
      code: d.code,
      name: d.name,
      libName: d.libName,
      files: d.files
    }))
  };
}

/**
 * Custom pruning for recent files - limit and simplify
 */
function pruneRecentFiles(obj) {
  return {
    count: obj.count,
    lib: obj.lib,
    files: (obj.files || []).slice(0, 15).map(f => ({
      name: f.name,
      desc: f.desc,
      size: f.size,
      added: f.added,
      from: f.from,
      dirName: f.dirName
    }))
  };
}

/**
 * Custom pruning for file search results - limit and simplify
 */
function pruneFileSearchResults(obj) {
  return {
    query: obj.query,
    count: obj.count,
    files: (obj.files || []).slice(0, 15).map(f => ({
      name: f.name,
      desc: f.desc,
      size: f.size,
      dirName: f.dirName,
      downloads: f.downloads
    }))
  };
}

/**
 * Custom pruning for node list - handle {length, items} wrapper
 */
function pruneNodeList(obj) {
  // API returns {length: N, items: [...]}
  const items = obj.items || obj;
  if (!Array.isArray(items)) return obj;
  
  // Filter to only active/in-use nodes and extract relevant fields
  const activeNodes = items
    .map((node, idx) => ({
      node: idx + 1,
      status: node.vstatus || node.status,
      user: node.useron,
      activity: node.activity || node.action
    }))
    .filter(n => n.status !== 'Waiting for connection' && n.status !== 0);
  
  return {
    totalNodes: items.length,
    activeNodes: activeNodes.length,
    nodes: activeNodes
  };
}

/**
 * Prune data to only include relevant fields for a given tool.
 * This prevents overwhelming the LLM with 50+ irrelevant fields.
 */
function pruneData(toolName, obj) {
  // Custom handling for tools with large/nested data
  switch (toolName) {
    // System tools
    case "getNodeList":
      return pruneNodeList(obj);
    
    // Usage tools
    case "getMonthlyUsage":
      return pruneMonthlyUsage(obj);
    case "getUsageSummary":
      return pruneUsageSummary(obj);
    case "getUserUsage":
      return pruneUserUsage(obj);
    case "getProgramUsage":
      return pruneProgramUsage(obj);
    case "listPrograms":
      return pruneListPrograms(obj);
    
    // Message tools
    case "getMessageAreaSummary":
      return pruneMessageSummary(obj);
    case "listMessageSubs":
      return pruneListSubs(obj);
    case "getMessageActivity":
    case "getGroupActivity":
      return pruneMessageActivity(obj);
    case "getSubRecentMessages":
      return pruneSubRecent(obj);
    case "getUserRecentPosts":
      return pruneUserPosts(obj);
    case "searchMessages":
      return pruneSearchResults(obj);
    
    // File tools
    case "getFileAreaSummary":
      return pruneFileAreaSummary(obj);
    case "listFileDirectories":
      return pruneListDirs(obj);
    case "getRecentFiles":
    case "getDirRecentFiles":
      return pruneRecentFiles(obj);
    case "searchFiles":
      return pruneFileSearchResults(obj);
  }

  const fields = RELEVANT_FIELDS[toolName];
  
  // If no field list defined, return as-is
  if (!fields) return obj;
  
  // If it's an array (like node_list), prune each item
  if (Array.isArray(obj)) {
    return obj.map(item => pruneData(toolName, item));
  }
  
  // If not an object, return as-is
  if (typeof obj !== "object" || obj === null) return obj;
  
  // Only include specified fields
  const result = {};
  for (const field of fields) {
    if (obj[field] !== undefined) {
      result[field] = obj[field];
    }
  }
  return result;
}

/**
 * Pre-process data to make it more LLM-friendly.
 * Converts timestamps to readable dates, durations to readable strings.
 */
function humanizeData(obj, depth = 0) {
  if (depth > 5) return obj; // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => humanizeData(item, depth + 1));
  }
  
  const result = {};
  const now = Date.now() / 1000; // Current time in seconds
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number") {
      // Special case: uptime is when system started, calculate duration
      if (key === "uptime" && value > 946684800 && value < 2147483647) {
        const uptimeSecs = Math.floor(now - value);
        const days = Math.floor(uptimeSecs / 86400);
        const hours = Math.floor((uptimeSecs % 86400) / 3600);
        if (days > 0) {
          result[key] = `${days} days ${hours} hours`;
        } else {
          result[key] = `${hours} hours`;
        }
      }
      // Millisecond timestamps (usage data)
      else if (TIMESTAMP_MS_FIELDS.has(key) && value > 946684800000 && value < 2147483647000) {
        const date = new Date(value);
        const agoMs = Date.now() - value;
        const agoDays = Math.floor(agoMs / 86400000);
        let agoStr = "";
        if (agoDays === 0) agoStr = "today";
        else if (agoDays === 1) agoStr = "yesterday";
        else if (agoDays < 30) agoStr = `${agoDays} days ago`;
        else if (agoDays < 365) agoStr = `${Math.floor(agoDays / 30)} months ago`;
        else agoStr = `${Math.floor(agoDays / 365)} years ago`;
        
        result[key] = `${date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} (${agoStr})`;
      }
      // Check if it's a timestamp field (seconds)
      else if (TIMESTAMP_FIELDS.has(key) && value > 946684800 && value < 2147483647) {
        // Looks like a Unix timestamp (after year 2000, before 2038)
        const date = new Date(value * 1000);
        const ago = Math.floor((now - value) / 86400); // Days ago
        let agoStr = "";
        if (ago === 0) agoStr = "today";
        else if (ago === 1) agoStr = "yesterday";
        else if (ago < 30) agoStr = `${ago} days ago`;
        else if (ago < 365) agoStr = `${Math.floor(ago / 30)} months ago`;
        else agoStr = `${Math.floor(ago / 365)} years ago`;
        
        result[key] = `${date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} (${agoStr})`;
      }
      // Check if it's a duration in seconds
      else if (DURATION_FIELDS.has(key)) {
        const hours = Math.floor(value / 3600);
        const mins = Math.floor((value % 3600) / 60);
        if (hours > 0) {
          result[key] = `${hours} hours ${mins} minutes`;
        } else {
          result[key] = `${mins} minutes`;
        }
      }
      // Duration in minutes
      else if (DURATION_MINUTES_FIELDS.has(key)) {
        result[key] = `${value} minutes`;
      }
      else {
        result[key] = value;
      }
    }
    else if (typeof value === "object" && value !== null) {
      result[key] = humanizeData(value, depth + 1);
    }
    else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Sanitize tool arguments - strip @ and # markers from values.
 * The LLM sees "@mro" or "#food" in user input but API wants just "mro" or "food".
 */
function sanitizeToolArgs(args) {
  if (!args || typeof args !== 'object') return args;
  
  const result = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      // Strip leading @ or # from string values
      result[key] = value.replace(/^[@#]+/, '').trim();
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class ToolExecutor {
  constructor(synchroClient, options = {}) {
    this.client = synchroClient;
    this.debug = options.debug ?? false;
    this.maxToolCalls = options.maxToolCalls ?? 5; // Prevent infinite loops
  }

  log(...args) {
    if (this.debug) console.log("[ToolExecutor]", ...args);
  }

  /**
   * Execute a single tool call
   * @param {string} toolName - Name of the tool to execute
   * @param {object} args - Arguments from the LLM
   * @returns {Promise<{success: boolean, result: any, error?: string}>}
   */
  async execute(toolName, args = {}) {
    const tool = getToolByName(toolName);
    
    if (!tool) {
      return { success: false, result: null, error: `Unknown tool: ${toolName}` };
    }

    this.log(`Executing tool: ${toolName}`, args);

    try {
      // Build the endpoint URL
      let endpoint = tool._endpoint;

      // Substitute path parameters: user/{user_number} → user/27
      if (tool._pathParams) {
        for (const param of tool._pathParams) {
          const value = args[param];
          if (value === undefined) {
            return { success: false, result: null, error: `Missing required parameter: ${param}` };
          }
          endpoint = endpoint.replace(`{${param}}`, encodeURIComponent(String(value)));
        }
      }

      // Build data object for query parameters
      const data = {};
      if (tool._dataParams) {
        for (const param of tool._dataParams) {
          if (args[param] !== undefined) {
            data[param] = args[param];
          }
        }
      }

      // Also include any args not already handled as path params
      for (const key of Object.keys(args)) {
        if (!tool._pathParams?.includes(key) && data[key] === undefined) {
          data[key] = args[key];
        }
      }

      this.log(`Calling API: ${endpoint}`, Object.keys(data).length ? data : "(no params)");

      // Make the API call
      let result = await this.client.request({
        oper: "READ",
        location: endpoint,
        data: Object.keys(data).length ? data : undefined
      });

      // CASCADING USERNAME SEARCH:
      // If findUser returns 0 (not found) and username has spaces,
      // progressively try shorter versions: "mro eat hamburgers" → "mro eat" → "mro"
      if (toolName === "findUser" && result === 0 && data.username && data.username.includes(" ")) {
        const words = data.username.split(/\s+/);
        this.log(`Cascading search: "${data.username}" not found, trying shorter versions`);
        
        // Try progressively shorter versions
        for (let len = words.length - 1; len >= 1; len--) {
          const shorterName = words.slice(0, len).join(" ");
          this.log(`Cascading search: trying "${shorterName}"`);
          
          const cascadeResult = await this.client.request({
            oper: "READ",
            location: endpoint,
            data: { username: shorterName }
          });
          
          if (cascadeResult !== 0 && cascadeResult !== null) {
            this.log(`Cascading search: found user with "${shorterName}" → ${cascadeResult}`);
            result = cascadeResult;
            break;
          }
        }
      }
      
      // CASCADING for getUserRecentPosts and getUserUsage:
      // These return objects with count: 0 or empty arrays when user not found
      const usernameTools = ["getUserRecentPosts", "getUserUsage"];
      const usernameEmpty = (r) => !r || r.count === 0 || (Array.isArray(r.posts) && r.posts.length === 0);
      
      if (usernameTools.includes(toolName) && usernameEmpty(result) && data.username && data.username.includes(" ")) {
        const words = data.username.split(/\s+/);
        this.log(`Cascading search: "${data.username}" returned no data, trying shorter versions`);
        
        for (let len = words.length - 1; len >= 1; len--) {
          const shorterName = words.slice(0, len).join(" ");
          this.log(`Cascading search: trying "${shorterName}"`);
          
          const cascadeResult = await this.client.request({
            oper: "READ",
            location: endpoint,
            data: { ...data, username: shorterName }
          });
          
          if (!usernameEmpty(cascadeResult)) {
            this.log(`Cascading search: found data with "${shorterName}"`);
            result = cascadeResult;
            break;
          }
        }
      }

      this.log(`Result:`, typeof result === "object" ? JSON.stringify(result).slice(0, 200) : result);

      return { success: true, result };

    } catch (e) {
      this.log(`Error:`, e.message);
      return { success: false, result: null, error: e.message };
    }
  }

  /**
   * Execute multiple tool calls in series
   * @param {Array<{name: string, arguments: object}>} toolCalls
   * @returns {Promise<Array<{tool: string, success: boolean, result: any}>>}
   */
  async executeAll(toolCalls) {
    const results = [];

    for (const call of toolCalls.slice(0, this.maxToolCalls)) {
      const name = call.name || call.function?.name;
      const args = call.arguments || call.function?.arguments || {};
      
      // Parse arguments if they're a string (Ollama sometimes returns JSON string)
      const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
      
      // Sanitize: strip @ and # from argument values
      const sanitizedArgs = sanitizeToolArgs(parsedArgs);

      const result = await this.execute(name, sanitizedArgs);
      results.push({ tool: name, ...result });
    }

    return results;
  }

  /**
   * Format tool results for injection into LLM context
   * Prunes to relevant fields, humanizes timestamps, adds personality reminder
   * @param {Array<{tool: string, success: boolean, result: any}>} results
   * @param {string} intent - 'data', 'hybrid', 'creative', or 'chat'
   * @returns {string}
   */
  formatResultsForLLM(results, intent = 'data') {
    const parts = [];

    for (const r of results) {
      const hint = getHumanHint(r.tool);
      
      if (r.success) {
        // Prune to only relevant fields, then humanize timestamps
        const pruned = pruneData(r.tool, r.result);
        const humanized = humanizeData(pruned);
        const formatted = typeof humanized === "object" 
          ? JSON.stringify(humanized, null, 2)
          : String(humanized);
        parts.push(`[${r.tool}]\n${formatted}`);
      } else {
        parts.push(`[${r.tool}]: ERROR - ${r.error}`);
      }
    }

    // Different reminders based on intent
    let reminder;
    
    if (intent === 'hybrid') {
      // Creative mode with data - encourage weaving data into creative output
      reminder = `
───────────────────────────────────────────────────────────────
Use this data as inspiration for your creative response.
Weave the names and facts naturally into your poem/song/story.
Do not list the data - transform it into art.
───────────────────────────────────────────────────────────────`;
    } else {
      // Data mode - strict grounding
      reminder = `
───────────────────────────────────────────────────────────────
Answer using ONLY the data above. Use exact names from "from" field.
If no data matches, say so honestly. Be brief. Stay in character.
───────────────────────────────────────────────────────────────`;
    }

    return parts.join("\n\n") + reminder;
  }
}
