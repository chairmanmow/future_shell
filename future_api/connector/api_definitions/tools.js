// api_definitions/tools.js
//
// Comprehensive tool definitions for Ollama function calling.
// Maps to FUTURE_API endpoints on the Synchronet BBS.
//
// Each tool has:
//   - Standard Ollama fields (type, function.name, function.description, function.parameters)
//   - Custom fields for mapping to API:
//       _endpoint:     API location path (can include {param} placeholders)
//       _pathParams:   Array of params that go into the URL path
//       _dataParams:   Array of params that go into packet.data
//       _humanHint:    How to describe results naturally (guides LLM response)

export const TOOLS = [
  // ===========================================================================
  // SYSTEM INFORMATION
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getSystemInfo",
      description: "Get basic BBS system information including name, operator, location, version, inet_addr, number of nodes and platform. Use when asked about what system this is, who runs it, where it's located, or general system info.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    _endpoint: "system",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Describe the BBS naturally: its name, who operates it, where it's located, and how long it's been running."
  },
  {
    type: "function",
    function: {
      name: "getSystemStats",
      description: "Get system-wide statistics: total users, logons today, messages posted, files uploaded/downloaded. Use when asked about system activity, how busy the BBS is, or overall statistics.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    _endpoint: "system/stats",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Summarize activity naturally: how many users, how active today, message and file activity."
  },

  // ===========================================================================
  // NODE STATUS (Who's Online)
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getNodeList",
      description: "Get list of all terminal nodes and their current status. Shows who's online, what they're doing, and which nodes are available. Use when asked who's online, what nodes are active, or system status.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    _endpoint: "system/node_list",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "List active users naturally: 'mac is chatting on node 1, bob is reading messages on node 3'. Skip idle/waiting nodes unless specifically asked."
  },
  {
    type: "function",
    function: {
      name: "getNodeStatus",
      description: "Get detailed status of a specific node by number.",
      parameters: {
        type: "object",
        properties: {
          node_number: {
            type: "number",
            description: "The node number to check (1-based)"
          }
        },
        required: ["node_number"]
      }
    },
    _endpoint: "system/node_list/{node_number}",
    _pathParams: ["node_number"],
    _dataParams: [],
    _humanHint: "Describe node status naturally: who's on it, what they're doing, or if it's available."
  },

  // ===========================================================================
  // USER LOOKUP & INFORMATION  
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "findUser",
      description: "Find a user by their username/alias and get their user number. This is the FIRST step when looking up any user - you need their number before getting details. Returns 0 if not found.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "The username or alias to search for (case-insensitive)"
          }
        },
        required: ["username"]
      }
    },
    _endpoint: "system/matchuser",
    _pathParams: [],
    _dataParams: ["username"],
    _humanHint: "Just note whether user was found. If found, use getUserByNumber next to get their details."
  },
  {
    type: "function", 
    function: {
      name: "getUserByNumber",
      description: "Get detailed information about a user by their NUMERIC user ID. REQUIRES a real user_number from findUser first - NEVER guess or invent a number. If you only have a username like 'deuce', use findUser or getUserRecentPosts instead.",
      parameters: {
        type: "object",
        properties: {
          user_number: {
            type: "number",
            description: "The user's record number (get this from findUser first)"
          }
        },
        required: ["user_number"]
      }
    },
    _endpoint: "user/{user_number}",
    _pathParams: ["user_number"],
    _dataParams: [],
    _humanHint: "Describe the user naturally: their name, where they're from, when they joined or last visited. Don't list raw fields."
  },
  {
    type: "function",
    function: {
      name: "getUserStats",
      description: "Get activity statistics for a specific user: logon count, time online, posts, uploads/downloads. Use after getUserByNumber to get more detail.",
      parameters: {
        type: "object",
        properties: {
          user_number: {
            type: "number", 
            description: "The user's record number"
          }
        },
        required: ["user_number"]
      }
    },
    _endpoint: "user/{user_number}/stats",
    _pathParams: ["user_number"],
    _dataParams: [],
    _humanHint: "Summarize user activity naturally: how often they log in, how active they are, their contributions."
  },
  {
    type: "function",
    function: {
      name: "getUserLimits",
      description: "Get the limits/permissions for a user based on their security level: time per day, posts per day, etc.",
      parameters: {
        type: "object",
        properties: {
          user_number: {
            type: "number",
            description: "The user's record number"
          }
        },
        required: ["user_number"]
      }
    },
    _endpoint: "user/{user_number}/limits",
    _pathParams: ["user_number"],
    _dataParams: [],
    _humanHint: "Describe what the user is allowed to do: time limits, posting limits, etc."
  },

  // ===========================================================================
  // SERVER INFORMATION
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getServerInfo",
      description: "Get information about the JSON service server: version, active clients, bound addresses.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    _endpoint: "server",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Describe the server status: what it's running, how many clients connected."
  },

  // ===========================================================================
  // USERNAME LOOKUP
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getUsernameByNumber",
      description: "Get just the username/alias for a user number. Quick lookup when you only need the name.",
      parameters: {
        type: "object",
        properties: {
          user_number: {
            type: "number",
            description: "The user's record number"
          }
        },
        required: ["user_number"]
      }
    },
    _endpoint: "system/username",
    _pathParams: [],
    _dataParams: ["user_number"],
    _humanHint: "Use the username naturally in your response."
  },

  // ===========================================================================
  // USAGE/ACTIVITY TOOLS
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getUsageSummary",
      description: "Get external program (doors/games) usage statistics. Shows most popular programs, top users by time spent, and monthly activity. Use for questions about popular doors, games, or what people are playing.",
      parameters: { type: "object", properties: {}, required: [] }
    },
    _endpoint: "usage/summary",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Describe popular doors and active players naturally, like a sysop would."
  },
  {
    type: "function",
    function: {
      name: "listPrograms",
      description: "Get a list of all available door/game programs with their IDs. Use this FIRST if you're not sure of the exact program ID. Returns program IDs sorted by popularity.",
      parameters: { type: "object", properties: {}, required: [] }
    },
    _endpoint: "usage/programs",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Use the program IDs from this list when calling getProgramUsage."
  },
  {
    type: "function",
    function: {
      name: "getUserUsage",
      description: "Get a user's DOOR GAME / GAME PLAY activity across all time. Shows their favorite games, total time spent PLAYING GAMES, and when they last played. Do NOT use for forum posts - use getUserRecentPosts for message/forum activity. Use when asked about someone's favorite game, what games they play, or their gaming habits.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "The user's alias/username to look up. Fuzzy matching is supported."
          }
        },
        required: ["username"]
      }
    },
    _endpoint: "usage/user/{username}",
    _pathParams: ["username"],
    _dataParams: [],
    _humanHint: "Describe what games/doors this person enjoys, their favorite, and how active they are."
  },
  {
    type: "function",
    function: {
      name: "getProgramUsage",
      description: "Get usage statistics for a specific DOOR GAME or EXTERNAL PROGRAM (NOT a username). Shows top players, total usage, and when it was last played. The program_id must be a game/door name like 'tradewars', 'nba_jam', 'LORD'. Do NOT use this for usernames - use getUserRecentPosts or getUserUsage for people. Use when asked 'who plays [game]' or 'how popular is [door]'.",
      parameters: {
        type: "object",
        properties: {
          program_id: {
            type: "string",
            description: "The DOOR GAME or PROGRAM name (NOT a username). Examples: 'tradewars', 'LORD', 'nba_jam', 'doorkore'."
          }
        },
        required: ["program_id"]
      }
    },
    _endpoint: "usage/program/{program_id}",
    _pathParams: ["program_id"],
    _dataParams: [],
    _humanHint: "Describe who enjoys this game, the top players, and how popular it is."
  },
  {
    type: "function",
    function: {
      name: "getMonthlyUsage",
      description: "Get door/game usage for a specific month (YYYY-MM format). Use when asked about activity in a particular month, like 'What games were popular in November?'",
      parameters: {
        type: "object",
        properties: {
          month: {
            type: "string",
            description: "Month in YYYY-MM format (e.g., '2025-11' for November 2025)"
          }
        },
        required: ["month"]
      }
    },
    _endpoint: "usage/month/{month}",
    _pathParams: ["month"],
    _dataParams: [],
    _humanHint: "Describe activity for that month: popular games and active players."
  },

  // ===========================================================================
  // MESSAGE AREA TOOLS
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getMessageAreaSummary",
      description: "Get an overview of all message areas: total groups, subs, and post counts. Use when asked about message areas in general, how active the forums are, or what discussion areas exist.",
      parameters: { type: "object", properties: {}, required: [] }
    },
    _endpoint: "messages/summary",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Describe the message areas naturally: how many groups, most active areas."
  },
  {
    type: "function",
    function: {
      name: "listMessageSubs",
      description: "Get a list of all message sub-boards sorted by activity. Use this FIRST if you need to find a sub-board code. Returns sub codes, names, and post counts.",
      parameters: { type: "object", properties: {}, required: [] }
    },
    _endpoint: "messages/subs",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Use the sub codes from this list when calling other message tools."
  },
  {
    type: "function",
    function: {
      name: "getMessageActivity",
      description: "Get recent message activity across ALL areas. Shows the most recent posts from any sub-board. Use when asked 'what's new?' or 'any recent posts?' without specifying a particular area.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent messages to return (default 10, max 20)"
          }
        },
        required: []
      }
    },
    _endpoint: "messages/activity",
    _pathParams: [],
    _dataParams: ["limit"],
    _humanHint: "Describe recent activity: who posted what, where, and when."
  },
  {
    type: "function",
    function: {
      name: "getGroupActivity",
      description: "Get the LATEST messages from a message GROUP (network like DOVE-Net, fsxNet, Local). GROUPS are top-level containers that hold multiple SUB-BOARDS. The only groups are: 'DOVE-Net', 'fsxNet', 'Local'. Do NOT use this for sub-board names like 'general', 'bbs_ads' - use getSubRecentMessages for those. Use when asked 'What's new on DoveNet?' or 'What's happening on fsxNet?'",
      parameters: {
        type: "object",
        properties: {
          group_name: {
            type: "string",
            description: "The message group name. ONLY valid values: 'DOVE-Net', 'fsxNet', 'Local'. NOT for sub-boards like 'general'."
          },
          limit: {
            type: "number",
            description: "Number of recent messages to return (default 15, max 30)"
          }
        },
        required: ["group_name"]
      }
    },
    _endpoint: "messages/group/{group_name}",
    _pathParams: ["group_name"],
    _dataParams: ["limit"],
    _humanHint: "Describe recent activity from this specific network/group: who posted what topics."
  },
  {
    type: "function",
    function: {
      name: "getSubStats",
      description: "Get statistics for a specific message sub-board: post count, message range, configuration. Use when asked about a specific forum/area.",
      parameters: {
        type: "object",
        properties: {
          sub_code: {
            type: "string",
            description: "The sub-board code (e.g., 'general', 'bbs_ads'). Use listMessageSubs first if unsure."
          }
        },
        required: ["sub_code"]
      }
    },
    _endpoint: "messages/sub/{sub_code}",
    _pathParams: ["sub_code"],
    _dataParams: [],
    _humanHint: "Describe the sub-board: what it's for, how active it is."
  },
  {
    type: "function",
    function: {
      name: "getSubRecentMessages",
      description: "Get recent messages from a specific SUB-BOARD (forum area). Use for queries like 'what's new in general?', 'any posts in bbs_ads?', 'show me the general forum'. Sub-board names include: 'general', 'dove-general', 'dove-syncdisc', 'bbs_ads', etc. Fuzzy matching supported - 'general' will find 'local-general' or 'dove-general'.",
      parameters: {
        type: "object",
        properties: {
          sub_code: {
            type: "string",
            description: "The sub-board code or name (e.g., 'general', 'dove-general', 'syncdisc'). Fuzzy matching supported."
          },
          limit: {
            type: "number",
            description: "Number of messages to return (default 10, max 20)"
          }
        },
        required: ["sub_code"]
      }
    },
    _endpoint: "messages/sub/{sub_code}/recent",
    _pathParams: ["sub_code"],
    _dataParams: ["limit"],
    _humanHint: "Describe recent posts: who's been posting, what topics are being discussed."
  },
  {
    type: "function",
    function: {
      name: "getUserRecentPosts",
      description: "Get a user's FORUM POSTS / MESSAGE BOARD posts across all areas. USE THIS when asked about someone's forum posts, what they've been writing, their message activity, or 'based on their posts'. Shows where they posted, subjects, and message content. Trigger phrases: 'forum posts', 'message posts', 'what is [name] talking about', 'what has [name] posted', 'based on [name]'s posts', 'their posts'. Use 'deep: true' for comprehensive search when standard search returns few results.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "The user's alias/name to search for (e.g., 'Gamgee', 'digital man', 'Larry Lagomorph')"
          },
          limit: {
            type: "number",
            description: "Number of posts to return (default 20, max 200)"
          },
          deep: {
            type: "boolean",
            description: "If true, performs comprehensive search of all subs (slower but finds more posts)"
          }
        },
        required: ["username"]
      }
    },
    _endpoint: "messages/user/{username}",
    _pathParams: ["username"],
    _dataParams: ["limit", "deep"],
    _humanHint: "Describe the user's posting activity: what they're discussing, which areas they're active in."
  },
  {
    type: "function",
    function: {
      name: "searchMessages",
      description: "SEARCH for messages about a SPECIFIC TOPIC (marked with #) and/or by a specific author (marked with @). Searches subject lines and message bodies. USE THIS when asked: 'is anyone discussing #topic?', 'any posts about #subject?', 'what has @user said about #topic?'. The 'query' parameter is ONLY for explicit #topic searches - do NOT extract keywords from creative requests like 'write a song dissing @user'.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "ONLY use for explicit #topic references. Do NOT extract words from creative prompts (poem, song, story requests)."
          },
          from: {
            type: "string",
            description: "Filter by author name (for @user queries)"
          },
          limit: {
            type: "number",
            description: "Number of results to return (default 20, max 200)"
          },
          deep: {
            type: "boolean",
            description: "If true, performs comprehensive search using all message headers (slower but more thorough)"
          },
          subCode: {
            type: "string",
            description: "Limit search to a specific sub-board code"
          }
        },
        required: []
      }
    },
    _endpoint: "messages/search",
    _pathParams: [],
    _dataParams: ["query", "from", "limit", "deep", "subCode"],
    _humanHint: "Describe the search results: what topics came up, who was discussing them."
  },

  // ===========================================================================
  // DISCOVERY / SCHEMA
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "probeApi",
      description: "Get information about the API itself: available routes, loaded objects, capabilities. Use when you're not sure what's available.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    _endpoint: "__probe",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Describe the API capabilities."
  },

  // ===========================================================================
  // FILE AREA TOOLS
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getFileAreaSummary",
      description: "Get an overview of all file areas: libraries, directories, and file counts. Use when asked about file areas in general, what's available for download, or how many files are on the system.",
      parameters: { type: "object", properties: {}, required: [] }
    },
    _endpoint: "files/summary",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Describe the file areas naturally: how many libraries, directories, total files available."
  },
  {
    type: "function",
    function: {
      name: "listFileDirectories",
      description: "Get a list of all file directories sorted by file count. Use this FIRST if you need to find a directory code. Returns directory codes, names, and file counts.",
      parameters: { type: "object", properties: {}, required: [] }
    },
    _endpoint: "files/dirs",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Use the directory codes from this list when calling other file tools."
  },
  {
    type: "function",
    function: {
      name: "getRecentFiles",
      description: "Get recently added files across all directories or from a specific library. Use when asked 'what's new?' or 'any new uploads?' for files.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent files to return (default 20, max 50)"
          },
          lib: {
            type: "string",
            description: "Optional library name to filter by (e.g., 'Main', 'Games')"
          }
        },
        required: []
      }
    },
    _endpoint: "files/recent",
    _pathParams: [],
    _dataParams: ["limit", "lib"],
    _humanHint: "Describe recent uploads: what files were added, by whom, when."
  },
  {
    type: "function",
    function: {
      name: "searchFiles",
      description: "Search for files by name or description. Use when asked to find a specific file or files matching a pattern.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for in filenames and descriptions"
          },
          limit: {
            type: "number",
            description: "Max results to return (default 20, max 100)"
          }
        },
        required: ["query"]
      }
    },
    _endpoint: "files/search",
    _pathParams: [],
    _dataParams: ["query", "limit"],
    _humanHint: "Describe matching files: what was found, where, file sizes."
  },
  {
    type: "function",
    function: {
      name: "getLibraryDetails",
      description: "Get details about a specific file library including all its directories.",
      parameters: {
        type: "object",
        properties: {
          lib_name: {
            type: "string",
            description: "Library name (e.g., 'Main', 'Games', 'Utilities')"
          }
        },
        required: ["lib_name"]
      }
    },
    _endpoint: "files/lib/{lib_name}",
    _pathParams: ["lib_name"],
    _dataParams: [],
    _humanHint: "Describe the library: what directories it contains, how many files."
  },
  {
    type: "function",
    function: {
      name: "getDirStats",
      description: "Get statistics for a specific file directory: file count, configuration, access permissions.",
      parameters: {
        type: "object",
        properties: {
          dir_code: {
            type: "string",
            description: "Directory code (e.g., 'uploads', 'games'). Use listFileDirectories first if unsure."
          }
        },
        required: ["dir_code"]
      }
    },
    _endpoint: "files/dir/{dir_code}",
    _pathParams: ["dir_code"],
    _dataParams: [],
    _humanHint: "Describe the directory: what it's for, how many files, access rules."
  },
  {
    type: "function",
    function: {
      name: "getDirRecentFiles",
      description: "Get recently added files from a specific directory.",
      parameters: {
        type: "object",
        properties: {
          dir_code: {
            type: "string",
            description: "Directory code"
          },
          limit: {
            type: "number",
            description: "Number of files to return (default 20, max 50)"
          }
        },
        required: ["dir_code"]
      }
    },
    _endpoint: "files/dir/{dir_code}/recent",
    _pathParams: ["dir_code"],
    _dataParams: ["limit"],
    _humanHint: "Describe recent files in this directory."
  },

  // ===========================================================================
  // SYSTEM PROPERTY TOOLS
  // ===========================================================================
  {
    type: "function",
    function: {
      name: "getSystemProperty",
      description: "Get a specific system property by name. Common properties: timezone, name, operator, location, version, platform, nodes, uptime, freediskspace, freediskspacek, qwk_id, inet_addr, last_user, last_useron, pwdays, newuser_level, fido_addr_list. Use listSystemProperties first if unsure of exact name.",
      parameters: {
        type: "object",
        properties: {
          property_name: {
            type: "string",
            description: "Property name (e.g., 'timezone', 'uptime', 'freediskspace', 'operator'). Fuzzy matching supported."
          }
        },
        required: ["property_name"]
      }
    },
    _endpoint: "system/property/{property_name}",
    _pathParams: ["property_name"],
    _dataParams: [],
    _humanHint: "State the property value naturally."
  },
  {
    type: "function",
    function: {
      name: "listSystemProperties",
      description: "Get a list of all available system properties that can be queried. Use when you need to know what properties are available.",
      parameters: { type: "object", properties: {}, required: [] }
    },
    _endpoint: "system/properties",
    _pathParams: [],
    _dataParams: [],
    _humanHint: "Describe the available properties."
  }
];

/**
 * Get tools array formatted for Ollama API
 * @returns {Array} Tools in Ollama format
 */
export function getOllamaTools() {
  return TOOLS.map(t => ({
    type: t.type,
    function: t.function
  }));
}

/**
 * Get a tool definition by name (includes custom fields)
 * @param {string} name - Tool/function name
 * @returns {object|null}
 */
export function getToolByName(name) {
  return TOOLS.find(t => t.function.name === name) || null;
}

/**
 * Get all tool names
 * @returns {string[]}
 */
export function getToolNames() {
  return TOOLS.map(t => t.function.name);
}

/**
 * Get the human hint for a tool (helps LLM format response)
 * @param {string} name - Tool name
 * @returns {string}
 */
export function getHumanHint(name) {
  const tool = getToolByName(name);
  return tool?._humanHint || "Present this information naturally.";
}

