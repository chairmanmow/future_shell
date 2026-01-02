// sbbs/mods/future_api/lib/whitelist.js
//
// Whitelist configuration for CREATE operations in FUTURE_API.
// Only resources explicitly listed here can be created via the API.
//
// This provides a sandbox for testing CREATE functionality before
// opening it up more broadly.

var FutureAPIWhitelist = {

    // =========================================================================
    // MESSAGE SUB-BOARDS ALLOWED FOR POSTING
    // These can be exact internal codes or partial matches.
    // The matching is case-insensitive and supports:
    //   - Exact match: "local-metatronsmusings"  
    //   - Short code: "metatronsmusings" (matches any group prefix)
    // =========================================================================
    MESSAGE_SUBS: [
        "metatronsmusings"  // LOCAL group - METATRONSMUSINGS sub
    ],

    // =========================================================================
    // FILE DIRECTORIES ALLOWED FOR UPLOADS
    // These can be exact internal codes or partial matches.
    // The matching is case-insensitive and supports:
    //   - Exact match: "main-metatronstuff"
    //   - Short code: "metatronstuff" (matches any library prefix)
    // =========================================================================
    FILE_DIRS: [
        "metatronstuff"  // Main File Library - METATRONSTUFF directory
    ],

    // =========================================================================
    // Helper functions
    // =========================================================================

    // Check if a message sub is whitelisted for posting
    // Supports partial matching - "metatronsmusings" matches "local-metatronsmusings"
    isSubWhitelisted: function(subCode) {
        if (!subCode) return false;
        var codeLower = String(subCode).toLowerCase();
        
        for (var i = 0; i < this.MESSAGE_SUBS.length; i++) {
            var whitelisted = this.MESSAGE_SUBS[i].toLowerCase();
            
            // Exact match
            if (codeLower === whitelisted) {
                return true;
            }
            
            // Check if the sub code ends with the whitelisted value (after a separator)
            // e.g., "local-metatronsmusings" ends with "-metatronsmusings"
            if (codeLower.indexOf("-" + whitelisted) !== -1 ||
                codeLower.indexOf("_" + whitelisted) !== -1) {
                return true;
            }
            
            // Check if whitelisted ends with the sub code (partial match other way)
            if (whitelisted.indexOf("-" + codeLower) !== -1 ||
                whitelisted.indexOf("_" + codeLower) !== -1) {
                return true;
            }
        }
        return false;
    },

    // Check if a file directory is whitelisted for uploads
    // Supports partial matching - "metatronstuff" matches "main-metatronstuff"
    isDirWhitelisted: function(dirCode) {
        if (!dirCode) return false;
        var codeLower = String(dirCode).toLowerCase();
        
        for (var i = 0; i < this.FILE_DIRS.length; i++) {
            var whitelisted = this.FILE_DIRS[i].toLowerCase();
            
            // Exact match
            if (codeLower === whitelisted) {
                return true;
            }
            
            // Check if the dir code ends with the whitelisted value (after a separator)
            if (codeLower.indexOf("-" + whitelisted) !== -1 ||
                codeLower.indexOf("_" + whitelisted) !== -1) {
                return true;
            }
            
            // Check if whitelisted ends with the dir code
            if (whitelisted.indexOf("-" + codeLower) !== -1 ||
                whitelisted.indexOf("_" + codeLower) !== -1) {
                return true;
            }
        }
        return false;
    },

    // Get list of whitelisted message subs for discovery
    getWhitelistedSubs: function() {
        return this.MESSAGE_SUBS.slice();
    },

    // Get list of whitelisted file dirs for discovery
    getWhitelistedDirs: function() {
        return this.FILE_DIRS.slice();
    }
};

// Export for use with load()
if (typeof module !== "undefined") module.exports = FutureAPIWhitelist;
