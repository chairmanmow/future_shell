// sbbs/mods/future_api/lib/registry.js
//
// Metadata registry for FUTURE_API generic object access.
// Defines available objects, properties, methods, types, and security rules.
//
// Usage:
//   load(system.mods_dir + "future_api/lib/registry.js");
//   var reg = new FutureAPIRegistry();
//   var meta = reg.lookup("system/stats/total_users");

function FutureAPIRegistry() {
    this.VERSION = "1.0.0";
    
    // =========================================================================
    // SECURITY: Load blacklist from separate config file
    // =========================================================================
    this.BLACKLIST = [];
    this.WRITE_BLACKLIST = [];
    this.PATTERNS = [];
    
    try {
        var libPath = system.mods_dir;
        if (libPath && libPath.slice(-1) !== "/" && libPath.slice(-1) !== "\\") libPath += "/";
        libPath += "future_api/lib/blacklist.js";
        
        load(libPath);
        
        if (typeof FutureAPIBlacklist !== "undefined") {
            this.BLACKLIST = FutureAPIBlacklist.BLACKLIST || [];
            this.WRITE_BLACKLIST = FutureAPIBlacklist.WRITE_BLACKLIST || [];
            this.PATTERNS = FutureAPIBlacklist.PATTERNS || [];
            log("FUTURE_API loaded blacklist: " + this.BLACKLIST.length + " blocked, " + this.WRITE_BLACKLIST.length + " write-blocked, " + this.PATTERNS.length + " patterns");
        }
    } catch (e) {
        log("FUTURE_API blacklist load error: " + String(e) + " - using empty blacklist");
    }
    
    // =========================================================================
    // TYPE DEFINITIONS
    // =========================================================================
    this.TYPES = {
        STRING: "string",
        NUMBER: "number", 
        BOOLEAN: "boolean",
        OBJECT: "object",
        ARRAY: "array",
        NULL: "null"
    };
    
    // =========================================================================
    // OBJECT REGISTRY
    // Each root object defines its properties, methods, and child objects
    // =========================================================================
    this.objects = {};
    
    // -------------------------------------------------------------------------
    // SYSTEM OBJECT
    // -------------------------------------------------------------------------
    this.objects.system = {
        type: "global",
        description: "Global system-related properties and methods",
        resolver: function() { return system; },
        
        properties: {
            // Core system info
            name:               { type: "string", readOnly: true, desc: "BBS name" },
            operator:           { type: "string", readOnly: true, desc: "Operator name" },
            operator_available: { type: "boolean", readOnly: false, desc: "Operator is available for chat" },
            guru:               { type: "string", readOnly: true, desc: "Default Guru (AI) name" },
            qwk_id:             { type: "string", readOnly: true, desc: "System QWK-ID" },
            location:           { type: "string", readOnly: true, desc: "Location (city, state)" },
            inet_addr:          { type: "string", readOnly: true, desc: "Internet address (host or domain)" },
            timezone:           { type: "number", readOnly: true, desc: "Local timezone in SMB format" },
            tz_offset:          { type: "number", readOnly: true, desc: "Timezone offset in minutes from UTC" },
            
            // Date/time formatting
            date_format:        { type: "number", readOnly: true, desc: "Date representation (0=Month first, 1=Day first, 2=Year first)" },
            date_separator:     { type: "string", readOnly: true, desc: "Short date field separator" },
            date_verbal:        { type: "boolean", readOnly: true, desc: "Month displayed verbally" },
            
            // Password settings
            pwdays:             { type: "number", readOnly: true, desc: "Days between forced password changes" },
            min_password_length:{ type: "number", readOnly: true, desc: "Minimum password length" },
            max_password_length:{ type: "number", readOnly: true, desc: "Maximum password length" },
            
            // User management
            deldays:            { type: "number", readOnly: true, desc: "Days to preserve deleted user records" },
            autodel:            { type: "number", readOnly: true, desc: "Days of inactivity before auto-deletion" },
            last_user:          { type: "number", readOnly: true, desc: "Last user record number" },
            last_useron:        { type: "string", readOnly: true, desc: "Name of last user to logoff" },
            
            // System resources
            freediskspace:      { type: "number", readOnly: true, desc: "Free disk space (bytes)" },
            freediskspacek:     { type: "number", readOnly: true, desc: "Free disk space (kibibytes)" },
            
            // Nodes
            nodes:              { type: "number", readOnly: true, desc: "Total number of nodes" },
            last_node:          { type: "number", readOnly: true, desc: "Last displayable node number" },
            
            // Features
            mqtt_enabled:       { type: "boolean", readOnly: true, desc: "MQTT support enabled" },
            settings:           { type: "number", readOnly: true, desc: "Settings bit-flags" },
            login_settings:     { type: "number", readOnly: true, desc: "Login settings bit-flags" },
            
            // New user defaults
            newuser_level:      { type: "number", readOnly: true, desc: "New user security level" },
            newuser_flags1:     { type: "number", readOnly: true, desc: "New user flag set #1" },
            newuser_flags2:     { type: "number", readOnly: true, desc: "New user flag set #2" },
            newuser_flags3:     { type: "number", readOnly: true, desc: "New user flag set #3" },
            newuser_flags4:     { type: "number", readOnly: true, desc: "New user flag set #4" },
            newuser_restrictions:    { type: "number", readOnly: true, desc: "New user restriction flags" },
            newuser_exemptions:      { type: "number", readOnly: true, desc: "New user exemption flags" },
            newuser_credits:         { type: "number", readOnly: true, desc: "New user credits" },
            newuser_minutes:         { type: "number", readOnly: true, desc: "New user extra minutes" },
            newuser_command_shell:   { type: "string", readOnly: true, desc: "New user default command shell" },
            newuser_editor:          { type: "string", readOnly: true, desc: "New user default editor" },
            newuser_settings:        { type: "number", readOnly: true, desc: "New user default settings" },
            newuser_download_protocol: { type: "string", readOnly: true, desc: "New user default file transfer protocol" },
            newuser_expiration_days: { type: "number", readOnly: true, desc: "New user expiration days" },
            newuser_questions:       { type: "number", readOnly: true, desc: "New user questions/prompts" },
            
            // Expired user settings
            expired_level:      { type: "number", readOnly: true, desc: "Expired user security level" },
            expired_flags1:     { type: "number", readOnly: true, desc: "Expired user flag set #1" },
            expired_flags2:     { type: "number", readOnly: true, desc: "Expired user flag set #2" },
            expired_flags3:     { type: "number", readOnly: true, desc: "Expired user flag set #3" },
            expired_flags4:     { type: "number", readOnly: true, desc: "Expired user flag set #4" },
            expired_restrictions:    { type: "number", readOnly: true, desc: "Expired user restriction flags" },
            expired_exemptions:      { type: "number", readOnly: true, desc: "Expired user exemption flags" },
            
            // Directories
            node_dir:           { type: "string", readOnly: true, desc: "Current node directory" },
            ctrl_dir:           { type: "string", readOnly: true, desc: "Control file directory" },
            data_dir:           { type: "string", readOnly: true, desc: "Data file directory" },
            text_dir:           { type: "string", readOnly: true, desc: "Text file directory" },
            temp_dir:           { type: "string", readOnly: true, desc: "Temporary file directory" },
            exec_dir:           { type: "string", readOnly: true, desc: "Executable file directory" },
            mods_dir:           { type: "string", readOnly: true, desc: "Modified modules directory" },
            logs_dir:           { type: "string", readOnly: true, desc: "Log file directory" },
            
            // Platform info
            devnull:            { type: "string", readOnly: true, desc: "Platform-specific null device" },
            temp_path:          { type: "string", readOnly: true, desc: "Platform-specific temp directory" },
            cmd_shell:          { type: "string", readOnly: true, desc: "Platform-specific command shell" },
            platform:           { type: "string", readOnly: true, desc: "Platform description" },
            architecture:       { type: "string", readOnly: true, desc: "Architecture description" },
            
            // Timing
            clock_ticks:        { type: "number", readOnly: true, desc: "Elapsed time in clock ticks" },
            clock_ticks_per_second: { type: "number", readOnly: true, desc: "Clock ticks per second" },
            timer:              { type: "number", readOnly: true, desc: "High-resolution timer (seconds)" },
            uptime:             { type: "number", readOnly: true, desc: "System uptime (time_t)" },
            
            // Version info
            version:            { type: "string", readOnly: true, desc: "Synchronet version number" },
            revision:           { type: "string", readOnly: true, desc: "Synchronet revision letter" },
            beta_version:       { type: "string", readOnly: true, desc: "Alpha/beta designation" },
            full_version:       { type: "string", readOnly: true, desc: "Full version information" },
            version_notice:     { type: "string", readOnly: true, desc: "Version notice" },
            version_num:        { type: "number", readOnly: true, desc: "Version number decimal" },
            version_hex:        { type: "number", readOnly: true, desc: "Version number hex" },
            copyright:          { type: "string", readOnly: true, desc: "Copyright notice" },
            
            // Git info
            git_branch:         { type: "string", readOnly: true, desc: "Git branch name" },
            git_hash:           { type: "string", readOnly: true, desc: "Git commit hash" },
            git_date:           { type: "string", readOnly: true, desc: "Git commit date" },
            git_time:           { type: "number", readOnly: true, desc: "Git commit time (time_t)" },
            
            // Build info
            compiled_when:      { type: "string", readOnly: true, desc: "Compile date/time" },
            compiled_with:      { type: "string", readOnly: true, desc: "Compiler used" },
            
            // Library versions
            js_version:         { type: "string", readOnly: true, desc: "JavaScript engine version" },
            os_version:         { type: "string", readOnly: true, desc: "OS version" },
            socket_lib:         { type: "string", readOnly: true, desc: "Socket library version" },
            msgbase_lib:        { type: "string", readOnly: true, desc: "Message base library version" },
            
            // Network
            local_host_name:    { type: "string", readOnly: true, desc: "Private host name" },
            host_name:          { type: "string", readOnly: true, desc: "Public host name" },
            name_servers:       { type: "array", readOnly: true, desc: "Array of nameservers" },
            fido_addr_list:     { type: "array", readOnly: true, desc: "Array of FTN addresses" }
        },
        
        methods: {
            username: {
                desc: "Return name of user in specified user record number",
                args: [{ name: "user_number", type: "number", required: true }],
                returns: "string",
                safe: true
            },
            alias: {
                desc: "Return name of user that matches alias",
                args: [{ name: "alias", type: "string", required: true }],
                returns: "string",
                safe: true
            },
            find_login_id: {
                desc: "Find a user's login ID, returns user record number or 0",
                args: [{ name: "user_id", type: "string", required: true }],
                returns: "number",
                safe: true
            },
            matchuser: {
                desc: "Exact user name matching, returns user number or 0",
                args: [
                    { name: "username", type: "string", required: true },
                    { name: "sysop_alias", type: "boolean", required: false, default: true }
                ],
                returns: "number",
                safe: true
            },
            zonestr: {
                desc: "Convert timezone integer to string",
                args: [{ name: "timezone", type: "number", required: false }],
                returns: "string",
                safe: true
            },
            timestr: {
                desc: "Convert time_t to time string",
                args: [{ name: "time", type: "number", required: false }],
                returns: "string",
                safe: true
            },
            datestr: {
                desc: "Convert time_t to date string",
                args: [{ name: "time", type: "number", required: false }],
                returns: "string",
                safe: true
            },
            secondstr: {
                desc: "Convert seconds to hh:mm:ss format",
                args: [{ name: "seconds", type: "number", required: true }],
                returns: "string",
                safe: true
            },
            text: {
                desc: "Return specified text string",
                args: [{ name: "index_or_id", type: "string", required: true }],
                returns: "string",
                safe: true
            },
            trashcan: {
                desc: "Search trashcan file for string",
                args: [
                    { name: "basename", type: "string", required: true },
                    { name: "find_string", type: "string", required: true }
                ],
                returns: "boolean",
                safe: true
            },
            findstr: {
                desc: "Search file or array for string",
                args: [
                    { name: "path_or_array", type: "string", required: true },
                    { name: "find_string", type: "string", required: true }
                ],
                returns: "boolean",
                safe: true
            },
            check_name: {
                desc: "Check if name/alias is valid for new user",
                args: [{ name: "name", type: "string", required: true }],
                returns: "boolean",
                safe: true
            },
            check_filename: {
                desc: "Verify filename is legal and allowed for upload",
                args: [{ name: "filename", type: "string", required: true }],
                returns: "boolean",
                safe: true
            },
            allowed_filename: {
                desc: "Verify filename is allowed for upload",
                args: [{ name: "filename", type: "string", required: true }],
                returns: "boolean",
                safe: true
            },
            safest_filename: {
                desc: "Verify filename contains only safest characters",
                args: [{ name: "filename", type: "string", required: true }],
                returns: "boolean",
                safe: true
            },
            illegal_filename: {
                desc: "Check if filename contains illegal characters",
                args: [{ name: "filename", type: "string", required: true }],
                returns: "boolean",
                safe: true
            },
            check_pid: {
                desc: "Check if process ID is valid",
                args: [{ name: "pid", type: "number", required: true }],
                returns: "boolean",
                safe: true
            },
            get_node: {
                desc: "Read a node data record",
                args: [{ name: "node_number", type: "number", required: true }],
                returns: "object",
                safe: true
            },
            get_telegram: {
                desc: "Get waiting telegrams for user",
                args: [{ name: "user_number", type: "number", required: true }],
                returns: "string",
                safe: true
            },
            get_node_message: {
                desc: "Get messages waiting for node",
                args: [{ name: "node_number", type: "number", required: true }],
                returns: "string",
                safe: true
            }
        },
        
        children: {
            stats: { ref: "system.stats" },
            node_list: { ref: "system.node_list", isArray: true }
        }
    };
    
    // -------------------------------------------------------------------------
    // SYSTEM.STATS OBJECT
    // -------------------------------------------------------------------------
    this.objects["system.stats"] = {
        type: "child",
        parent: "system",
        description: "System statistics (all READ ONLY)",
        resolver: function() { return system.stats; },
        
        properties: {
            total_logons:           { type: "number", readOnly: true, desc: "Total logons" },
            logons_today:           { type: "number", readOnly: true, desc: "Logons today" },
            total_timeon:           { type: "number", readOnly: true, desc: "Total time used" },
            timeon_today:           { type: "number", readOnly: true, desc: "Time used today" },
            total_files:            { type: "number", readOnly: true, desc: "Total files in file bases" },
            files_uploaded_today:   { type: "number", readOnly: true, desc: "Files uploaded today" },
            bytes_uploaded_today:   { type: "number", readOnly: true, desc: "Bytes uploaded today" },
            files_downloaded_today: { type: "number", readOnly: true, desc: "Files downloaded today" },
            bytes_downloaded_today: { type: "number", readOnly: true, desc: "Bytes downloaded today" },
            total_messages:         { type: "number", readOnly: true, desc: "Total messages in message bases" },
            messages_posted_today:  { type: "number", readOnly: true, desc: "Messages posted today" },
            total_email:            { type: "number", readOnly: true, desc: "Total messages in mail base" },
            email_sent_today:       { type: "number", readOnly: true, desc: "Email sent today" },
            total_feedback:         { type: "number", readOnly: true, desc: "Total feedback messages waiting" },
            feedback_sent_today:    { type: "number", readOnly: true, desc: "Feedback sent today" },
            total_users:            { type: "number", readOnly: true, desc: "Total user records" },
            new_users_today:        { type: "number", readOnly: true, desc: "New users today" }
        }
    };
    
    // -------------------------------------------------------------------------
    // SYSTEM.NODE_LIST ARRAY
    // -------------------------------------------------------------------------
    this.objects["system.node_list"] = {
        type: "array",
        parent: "system",
        description: "Terminal Server node listing",
        resolver: function(index) {
            if (index !== undefined && index !== null) {
                var i = parseInt(index, 10);
                if (!isNaN(i) && system.node_list && system.node_list[i]) {
                    return system.node_list[i];
                }
                return null;
            }
            return system.node_list;
        },
        
        itemProperties: {
            status:     { type: "number", readOnly: true, desc: "Status" },
            vstatus:    { type: "string", readOnly: true, desc: "Verbal status" },
            errors:     { type: "number", readOnly: true, desc: "Error counter" },
            action:     { type: "number", readOnly: true, desc: "Current user action" },
            activity:   { type: "string", readOnly: true, desc: "Current user activity" },
            useron:     { type: "number", readOnly: true, desc: "Current user number" },
            connection: { type: "number", readOnly: true, desc: "Connection speed" },
            misc:       { type: "number", readOnly: true, desc: "Miscellaneous bit-flags" },
            aux:        { type: "number", readOnly: true, desc: "Auxiliary value" },
            extaux:     { type: "number", readOnly: true, desc: "Extended auxiliary value" },
            dir:        { type: "string", readOnly: true, desc: "Node directory" }
        }
    };
    
    // -------------------------------------------------------------------------
    // USER OBJECT (instantiable)
    // -------------------------------------------------------------------------
    this.objects.user = {
        type: "instantiable",
        description: "User object - can access current user or by number",
        resolver: function(userNumber) {
            if (userNumber !== undefined && userNumber !== null) {
                var num = parseInt(userNumber, 10);
                if (!isNaN(num) && num > 0) {
                    try {
                        return new User(num);
                    } catch (e) {
                        return null;
                    }
                }
            }
            // Return global user if available (terminal server context)
            if (typeof user !== "undefined") {
                return user;
            }
            return null;
        },
        instanceParam: "user_number",
        
        properties: {
            number:         { type: "number", readOnly: true, desc: "Record number (1-based)" },
            alias:          { type: "string", readOnly: false, desc: "Alias/name" },
            name:           { type: "string", readOnly: false, desc: "Real name" },
            handle:         { type: "string", readOnly: false, desc: "Chat handle" },
            lang:           { type: "string", readOnly: false, desc: "Language code" },
            note:           { type: "string", readOnly: false, desc: "Sysop note" },
            ip_address:     { type: "string", readOnly: true, desc: "Last login IP" },
            host_name:      { type: "string", readOnly: true, desc: "Last login hostname" },
            comment:        { type: "string", readOnly: false, desc: "Sysop comment" },
            netmail:        { type: "string", readOnly: false, desc: "External email address" },
            email:          { type: "string", readOnly: true, desc: "Local Internet email" },
            address:        { type: "string", readOnly: false, desc: "Street address" },
            location:       { type: "string", readOnly: false, desc: "Location (city, state)" },
            zipcode:        { type: "string", readOnly: false, desc: "Zip/postal code" },
            phone:          { type: "string", readOnly: false, desc: "Phone number" },
            birthdate:      { type: "string", readOnly: false, desc: "Birth date" },
            birthyear:      { type: "number", readOnly: true, desc: "Birth year" },
            birthmonth:     { type: "number", readOnly: true, desc: "Birth month" },
            birthday:       { type: "number", readOnly: true, desc: "Birth day" },
            age:            { type: "number", readOnly: true, desc: "Calculated age" },
            connection:     { type: "string", readOnly: false, desc: "Connection type" },
            screen_rows:    { type: "number", readOnly: false, desc: "Terminal rows" },
            screen_columns: { type: "number", readOnly: false, desc: "Terminal columns" },
            gender:         { type: "string", readOnly: false, desc: "Gender" },
            cursub:         { type: "string", readOnly: false, desc: "Current message sub-board" },
            curdir:         { type: "string", readOnly: false, desc: "Current file directory" },
            curxtrn:        { type: "string", readOnly: false, desc: "Current external program" },
            editor:         { type: "string", readOnly: false, desc: "External message editor" },
            command_shell:  { type: "string", readOnly: false, desc: "Command shell" },
            settings:       { type: "number", readOnly: false, desc: "Settings bit-flags" },
            qwk_settings:   { type: "number", readOnly: false, desc: "QWK settings bit-flags" },
            chat_settings:  { type: "number", readOnly: false, desc: "Chat settings bit-flags" },
            mail_settings:  { type: "number", readOnly: false, desc: "Mail settings bit-flags" },
            temp_file_ext:  { type: "string", readOnly: false, desc: "Temp file type" },
            new_file_time:  { type: "number", readOnly: false, desc: "New file scan time" },
            download_protocol: { type: "string", readOnly: false, desc: "File transfer protocol" },
            logontime:      { type: "number", readOnly: true, desc: "Logon time" },
            cached:         { type: "boolean", readOnly: true, desc: "Record is cached" },
            is_sysop:       { type: "boolean", readOnly: true, desc: "User is sysop" }
        },
        
        children: {
            stats: { ref: "user.stats" },
            limits: { ref: "user.limits" }
        }
    };
    
    // -------------------------------------------------------------------------
    // USER.STATS OBJECT
    // -------------------------------------------------------------------------
    this.objects["user.stats"] = {
        type: "child",
        parent: "user",
        description: "User statistics (all READ ONLY)",
        resolver: function(userObj) {
            if (userObj && userObj.stats) return userObj.stats;
            return null;
        },
        
        properties: {
            laston_date:        { type: "number", readOnly: true, desc: "Date of previous logon" },
            firston_date:       { type: "number", readOnly: true, desc: "Date of first logon" },
            total_logons:       { type: "number", readOnly: true, desc: "Total logons" },
            logons_today:       { type: "number", readOnly: true, desc: "Logons today" },
            total_timeon:       { type: "number", readOnly: true, desc: "Total time used (minutes)" },
            timeon_today:       { type: "number", readOnly: true, desc: "Time used today (minutes)" },
            timeon_last_logon:  { type: "number", readOnly: true, desc: "Time used last session" },
            total_posts:        { type: "number", readOnly: true, desc: "Total messages posted" },
            total_emails:       { type: "number", readOnly: true, desc: "Total emails sent" },
            total_feedbacks:    { type: "number", readOnly: true, desc: "Total feedback sent" },
            email_today:        { type: "number", readOnly: true, desc: "Email sent today" },
            posts_today:        { type: "number", readOnly: true, desc: "Messages posted today" },
            bytes_uploaded:     { type: "number", readOnly: true, desc: "Total bytes uploaded" },
            files_uploaded:     { type: "number", readOnly: true, desc: "Total files uploaded" },
            bytes_downloaded:   { type: "number", readOnly: true, desc: "Total bytes downloaded" },
            files_downloaded:   { type: "number", readOnly: true, desc: "Total files downloaded" },
            download_cps:       { type: "number", readOnly: true, desc: "Latest download rate" },
            leech_attempts:     { type: "number", readOnly: true, desc: "Suspected leech downloads" },
            mail_waiting:       { type: "number", readOnly: true, desc: "Email messages waiting" },
            read_mail_waiting:  { type: "number", readOnly: true, desc: "Read email waiting" },
            unread_mail_waiting:{ type: "number", readOnly: true, desc: "Unread email waiting" },
            spam_waiting:       { type: "number", readOnly: true, desc: "SPAM email waiting" },
            mail_pending:       { type: "number", readOnly: true, desc: "Email pending deletion" }
        }
    };
    
    // -------------------------------------------------------------------------
    // USER.LIMITS OBJECT
    // -------------------------------------------------------------------------
    this.objects["user.limits"] = {
        type: "child",
        parent: "user",
        description: "User limitations based on security level (all READ ONLY)",
        resolver: function(userObj) {
            if (userObj && userObj.limits) return userObj.limits;
            return null;
        },
        
        properties: {
            time_per_logon:         { type: "number", readOnly: true, desc: "Time (minutes) per logon" },
            time_per_day:           { type: "number", readOnly: true, desc: "Time (minutes) per day" },
            logons_per_day:         { type: "number", readOnly: true, desc: "Logons per day" },
            lines_per_message:      { type: "number", readOnly: true, desc: "Lines per message" },
            email_per_day:          { type: "number", readOnly: true, desc: "Email sent per day" },
            posts_per_day:          { type: "number", readOnly: true, desc: "Messages posted per day" },
            free_credits_per_day:   { type: "number", readOnly: true, desc: "Free credits per day" }
        }
    };
    
    // -------------------------------------------------------------------------
    // SERVER OBJECT
    // -------------------------------------------------------------------------
    this.objects.server = {
        type: "global",
        description: "Server-specific properties",
        resolver: function() { return server; },
        
        properties: {
            version:                { type: "string", readOnly: true, desc: "Server name and version" },
            version_detail:         { type: "string", readOnly: true, desc: "Detailed version info" },
            interface_ip_address:   { type: "string", readOnly: true, desc: "First bound IPv4 address" },
            options:                { type: "number", readOnly: true, desc: "Startup options bit-field" },
            clients:                { type: "number", readOnly: true, desc: "Number of active clients" },
            interface_ip_addr_list: { type: "array", readOnly: true, desc: "Array of bound IP addresses" }
        }
    };
}

// =============================================================================
// LOOKUP METHODS
// =============================================================================

/**
 * Check if a path is blacklisted
 * @param {string} path - Dot-notation path (e.g., "system.new_user")
 * @returns {boolean}
 */
FutureAPIRegistry.prototype.isBlacklisted = function(path) {
    var p = String(path || "");
    
    // Check explicit blacklist
    for (var i = 0; i < this.BLACKLIST.length; i++) {
        if (this.BLACKLIST[i] === p) return true;
    }
    
    // Check patterns (regex)
    for (var j = 0; j < this.PATTERNS.length; j++) {
        var pattern = this.PATTERNS[j];
        if (pattern && pattern.test && pattern.test(p)) {
            return true;
        }
    }
    
    return false;
};

/**
 * Check if a path is write-blacklisted
 * @param {string} path - Dot-notation path
 * @returns {boolean}
 */
FutureAPIRegistry.prototype.isWriteBlacklisted = function(path) {
    var p = String(path || "");
    for (var i = 0; i < this.WRITE_BLACKLIST.length; i++) {
        var pattern = this.WRITE_BLACKLIST[i];
        if (pattern === p) return true;
        // Handle wildcard patterns like "system.*"
        if (pattern.indexOf("*") !== -1) {
            var prefix = pattern.replace(/\.\*$/, ".");
            if (p.indexOf(prefix) === 0 || p === prefix.slice(0, -1)) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Get object definition by key
 * @param {string} key - Object key (e.g., "system", "system.stats", "user")
 * @returns {object|null}
 */
FutureAPIRegistry.prototype.getObject = function(key) {
    return this.objects[key] || null;
};

/**
 * Parse a URL-style path into components
 * @param {string} location - URL path (e.g., "system/stats/total_users")
 * @returns {object} { segments: string[], objectKey: string, property: string|null, arrayIndex: number|null }
 */
FutureAPIRegistry.prototype.parsePath = function(location) {
    var loc = String(location || "");
    var segments = loc.split("/").filter(function(s) { return s.length > 0; });
    
    if (segments.length === 0) {
        return { segments: [], objectKey: null, property: null, arrayIndex: null };
    }
    
    var result = {
        segments: segments,
        objectKey: null,
        property: null,
        arrayIndex: null,
        methodName: null
    };
    
    // Try to find the deepest matching object
    var testKey = "";
    var lastMatchedIndex = -1;
    
    for (var i = 0; i < segments.length; i++) {
        testKey += (i > 0 ? "." : "") + segments[i];
        
        // Check for array index notation
        if (/^\d+$/.test(segments[i])) {
            result.arrayIndex = parseInt(segments[i], 10);
            continue;
        }
        
        if (this.objects[testKey]) {
            result.objectKey = testKey;
            lastMatchedIndex = i;
        }
    }
    
    // Whatever comes after the matched object is the property/method
    if (result.objectKey && lastMatchedIndex < segments.length - 1) {
        result.property = segments[lastMatchedIndex + 1];
        
        // Check if it's an array index
        if (/^\d+$/.test(result.property)) {
            result.arrayIndex = parseInt(result.property, 10);
            result.property = null;
            
            // Check for property after array index
            if (lastMatchedIndex + 2 < segments.length) {
                result.property = segments[lastMatchedIndex + 2];
            }
        }
    }
    
    return result;
};

/**
 * Lookup metadata for a given path
 * @param {string} location - URL path (e.g., "system/stats/total_users")
 * @returns {object} { found: boolean, type: string, meta: object, objectDef: object, path: string }
 */
FutureAPIRegistry.prototype.lookup = function(location) {
    var parsed = this.parsePath(location);
    
    var result = {
        found: false,
        type: null,         // "object", "property", "method", "array", "array_item"
        meta: null,         // Property/method metadata
        objectDef: null,    // Object definition
        objectKey: parsed.objectKey,
        property: parsed.property,
        arrayIndex: parsed.arrayIndex,
        dotPath: null       // Dot-notation path for blacklist checking
    };
    
    if (!parsed.objectKey) {
        return result;
    }
    
    var objDef = this.objects[parsed.objectKey];
    if (!objDef) {
        return result;
    }
    
    result.objectDef = objDef;
    result.dotPath = parsed.objectKey;
    
    // Array access
    if (objDef.type === "array") {
        if (parsed.arrayIndex !== null) {
            result.found = true;
            result.type = "array_item";
            
            if (parsed.property && objDef.itemProperties && objDef.itemProperties[parsed.property]) {
                result.type = "property";
                result.meta = objDef.itemProperties[parsed.property];
                result.dotPath = parsed.objectKey + "." + parsed.property;
            }
        } else {
            result.found = true;
            result.type = "array";
        }
        return result;
    }
    
    // No property specified - return the object itself
    if (!parsed.property) {
        result.found = true;
        result.type = "object";
        return result;
    }
    
    result.dotPath = parsed.objectKey + "." + parsed.property;
    
    // Check for property
    if (objDef.properties && objDef.properties[parsed.property]) {
        result.found = true;
        result.type = "property";
        result.meta = objDef.properties[parsed.property];
        return result;
    }
    
    // Check for method
    if (objDef.methods && objDef.methods[parsed.property]) {
        result.found = true;
        result.type = "method";
        result.meta = objDef.methods[parsed.property];
        return result;
    }
    
    // Check for child object
    if (objDef.children && objDef.children[parsed.property]) {
        var childRef = objDef.children[parsed.property].ref;
        if (this.objects[childRef]) {
            result.found = true;
            result.type = "object";
            result.objectDef = this.objects[childRef];
            result.objectKey = childRef;
            result.dotPath = childRef;
        }
        return result;
    }
    
    return result;
};

/**
 * Get list of available paths under a given prefix
 * @param {string} prefix - Object prefix (e.g., "system")
 * @returns {object} { properties: string[], methods: string[], children: string[] }
 */
FutureAPIRegistry.prototype.listPaths = function(prefix) {
    var objDef = this.objects[prefix];
    var result = { properties: [], methods: [], children: [] };
    
    if (!objDef) return result;
    
    if (objDef.properties) {
        for (var p in objDef.properties) {
            if (objDef.properties.hasOwnProperty(p)) {
                result.properties.push(p);
            }
        }
    }
    
    if (objDef.methods) {
        for (var m in objDef.methods) {
            if (objDef.methods.hasOwnProperty(m)) {
                if (objDef.methods[m].safe !== false) {
                    result.methods.push(m);
                }
            }
        }
    }
    
    if (objDef.children) {
        for (var c in objDef.children) {
            if (objDef.children.hasOwnProperty(c)) {
                result.children.push(c);
            }
        }
    }
    
    return result;
};

// Export for use with load()
if (typeof module !== "undefined") module.exports = FutureAPIRegistry;
