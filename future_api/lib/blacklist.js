// sbbs/mods/future_api/lib/blacklist.js
//
// Security blacklist configuration for FUTURE_API.
// Edit this file to control which paths are accessible via the API.
//
// BLACKLIST: Paths that are completely blocked (even for READ)
// WRITE_BLACKLIST: Paths that are readable but not writable
// PATTERNS: Regex patterns that block any matching path
//
// Supports wildcards: "system.*" blocks all system.* paths

var FutureAPIBlacklist = {
    
    // =========================================================================
    // PATTERN-BASED BLOCKING (regex patterns)
    // Any path matching these patterns is completely blocked
    // =========================================================================
    PATTERNS: [
        /password/i,        // Block anything containing "password"
        /passwd/i,          // Alternate spelling
        /secret/i,          // Block secrets
        /credential/i,      // Block credentials
        /security\.password/i,  // User security password
    ],
    
    // =========================================================================
    // COMPLETELY BLOCKED PATHS (no access at all)
    // =========================================================================
    BLACKLIST: [
        // ----- System methods that modify state -----
        "system.new_user",          // Create new user account
        "system.del_user",          // Delete user account
        "system.exec",              // Execute shell command
        "system.popen",             // Execute command with output capture
        "system.filter_ip",         // Modify IP filter
        "system.hacklog",           // Log hack attempt (could be abused)
        "system.spamlog",           // Log spam attempt (could be abused)
        "system.terminate_pid",     // Kill processes
        "system.put_node_message",  // Send node messages
        "system.put_telegram",      // Send telegrams
        "system.notify",            // Send notifications
        "system.check_syspass",     // System password check
        
        // ----- Password-related (explicit) -----
        "system.newuser_password",
        "system.newuser_magic_word",
        "system.min_password_length",
        "system.max_password_length",
        "system.pwdays",
        "user.security.password",
        "user.security.password_date",
        "bbs.rlogin_password",
        "bbs.good_password",
        "bbs.check_syspass",
        "login.password",
        "login.password_prompt",
        
        // ----- BBS session control -----
        "bbs.hangup",               // Disconnect user
        "bbs.logout",               // Logout user
        "bbs.logoff",               // Logoff user
        "bbs.login",                // Login as user
        "bbs.logon",                // Logon procedure
        "bbs.newuser",              // New user registration
        "bbs.exec",                 // Execute program
        "bbs.exec_xtrn",            // Execute external program
        "bbs.change_user",          // Switch to different user
        "bbs.spy",                  // Spy on node
        "bbs.telnet_gate",          // Telnet gateway
        "bbs.rlogin_gate",          // RLogin gateway
        "bbs.email",                // Send email
        "bbs.netmail",              // Send netmail
        "bbs.bulk_mail",            // Send bulk mail
        "bbs.post_msg",             // Post message
        "bbs.forward_msg",          // Forward message
        
        // ----- User modification methods -----
        "user.adjust_credits",      // Modify credits
        "user.adjust_minutes",      // Modify time
        "user.posted_message",      // Modify post stats
        "user.sent_email",          // Modify email stats
        "user.uploaded_file",       // Modify upload stats
        "user.downloaded_file",     // Modify download stats
        "user.security",            // Entire security object
        
        // ----- File operations -----
        "bbs.upload_file",          // Upload files
        "bbs.batch_upload",         // Batch upload
        "bbs.bulk_upload",          // Bulk upload
        "bbs.send_file",            // Send file to user
        "bbs.receive_file",         // Receive file from user
        
        // ----- Message base operations -----
        "msg_base.save_msg",        // Save message
        "msg_base.remove_msg",      // Remove message
        "msg_base.add_sub",         // Add sub-board
    ],
    
    // =========================================================================
    // WRITE-BLOCKED PATHS (readable but not writable)
    // =========================================================================
    WRITE_BLACKLIST: [
        // All system properties (read-only via API for safety)
        "system.*",
        
        // Server properties
        "server.*",
        
        // User security-sensitive fields
        "user.number",              // Can't change user number
        "user.cached",              // Internal flag
        "user.is_sysop",            // Can't grant sysop
        "user.security",            // Security object
        "user.security.*",          // All security properties
        "user.stats",               // Stats object
        "user.stats.*",             // All stats
        "user.limits",              // Limits object
        "user.limits.*",            // All limits
        
        // Read-only user properties
        "user.email",               // Generated from alias
        "user.ip_address",          // Last login IP
        "user.host_name",           // Last login host
        "user.age",                 // Calculated
        "user.birthyear",           // Derived from birthdate
        "user.birthmonth",          // Derived from birthdate
        "user.birthday",            // Derived from birthdate
        "user.logontime",           // Session time
        
        // Message area config
        "msg_area.settings",
        "msg_area.fido_netmail_settings",
        "msg_area.inet_netmail_settings",
    ]
};

// Export for use with load()
if (typeof module !== "undefined") module.exports = FutureAPIBlacklist;
