/**
 * user_policy.js - the account rules Synchronet's own chksetup enforces.
 *
 * Our signup wizard collects less than the stock new-user flow does, which is
 * the point - but it also skipped rules the stock flow applies, so accounts it
 * created showed up as issues in `chksetup`. This module is the single place
 * those rules live, so the wizard (at signup) and the backfill tool (over the
 * existing user base) cannot drift apart.
 *
 * Everything here defers to the C implementation where one exists
 * (system.check_realname, system.check_password, system.trashcan) rather than
 * re-deriving it: those read the live SCFG and the .can files, so a sysop who
 * retunes SCFG retunes this too. The one rule reimplemented in JS is the
 * "obvious password" comparison, because system.check_password() is called
 * with no user record and therefore skips it (see check_pass() in userdat.c) -
 * at signup time the account does not exist yet, so we compare against the
 * identity the wizard is about to create.
 *
 * Reference: src/sbbs3/userdat.c check_realname() / check_pass(),
 *            exec/chksetup.js check_user_names() / check_user_passwords().
 */

(function () {
    "use strict";

    /** sbbsdefs.h MIN_PASS_LEN - the floor no SCFG setting can go under. */
    var MIN_PASS_LEN = 4;

    /**
     * A real name derived from a handle. Synchronet keeps the real name in its
     * own field and check_realname() requires a space in it, so a one-word
     * handle is doubled ("Freak" -> "Freak Freak"); a handle that already reads
     * as two words is kept as it is. The user is never asked and never sees
     * this - it is data hygiene only.
     */
    function realNameFromAlias(alias) {
        var trimmed = String(alias || "").replace(/\s+/g, " ").trim();
        if (!trimmed.length) return "";
        var maxLen = (typeof LEN_NAME === "number" && LEN_NAME > 0) ? LEN_NAME : 25;
        if (trimmed.indexOf(" ") > 0) return trimmed.substr(0, maxLen);
        var doubled = trimmed + " " + trimmed;
        if (doubled.length <= maxLen) return doubled;
        // Handle too long to double outright: clip the second word so the
        // result still reads as two names rather than one truncated one.
        var room = maxLen - trimmed.length - 1;
        if (room < 1) return trimmed.substr(0, maxLen);
        return trimmed + " " + trimmed.substr(0, room);
    }

    /**
     * realNameFromAlias, but only if the result actually satisfies Synchronet.
     * Returns null when the handle cannot yield a valid real name at all -
     * check_realname() also demands an alphabetic first character and rejects
     * anything in text/name.can, so "3vil" and "_zed" have no doubled form
     * that passes. Callers reject the handle (at signup) or flag the account
     * for a human (in the backfill) rather than writing a name that will just
     * trip the audit again.
     */
    function deriveRealName(alias) {
        var candidate = realNameFromAlias(alias);
        if (!candidate.length) return null;
        try {
            if (typeof system.check_realname === "function" && !system.check_realname(candidate))
                return null;
        } catch (e) { /* older build without the check: take the candidate */ }
        return candidate;
    }

    function containsFold(haystack, needle) {
        if (!haystack || !needle) return false;
        return String(haystack).toUpperCase().indexOf(String(needle).toUpperCase()) >= 0;
    }

    /**
     * The "obvious password" rule from check_pass(): the password may not
     * contain, or be contained by, the alias (or either word of it), the real
     * name or the chat handle. chksetup only reports exact equality, but the
     * stock new-user flow rejects containment, and matching the stricter of
     * the two is what keeps the audit quiet.
     */
    function isObviousPassword(password, identity) {
        if (!password) return false;
        identity = identity || {};
        var parts = [];
        function add(value) { if (value && String(value).length) parts.push(String(value)); }
        add(identity.alias);
        add(identity.name);
        add(identity.handle);
        if (identity.alias) {
            var space = String(identity.alias).indexOf(" ");
            if (space > 0) {
                add(String(identity.alias).substring(0, space));
                add(String(identity.alias).substring(space + 1));
            }
        }
        for (var i = 0; i < parts.length; i++) {
            if (containsFold(password, parts[i]) || containsFold(parts[i], password)) return true;
        }
        return false;
    }

    /** Effective minimum password length: SCFG's, floored at MIN_PASS_LEN. */
    function minPasswordLength() {
        var min = MIN_PASS_LEN;
        try {
            if (typeof system.min_password_length === "number" && system.min_password_length > min)
                min = system.min_password_length;
        } catch (e) { }
        return min;
    }

    /** SCFG's maximum, or 0 for "no maximum". */
    function maxPasswordLength() {
        try {
            if (typeof system.max_password_length === "number") return system.max_password_length;
        } catch (e) { }
        return 0;
    }

    /**
     * Null when the password is acceptable, otherwise a short lowercase reason
     * fit to show the user. Checked in the order that produces the most useful
     * message: length first, then the reasons that need a fresh password.
     *
     * `password` should be the string that will actually be STORED - the
     * wizard uppercases before saving, and that is what chksetup will later
     * read back.
     */
    function passwordProblem(password, identity) {
        var pw = String(password || "");
        var min = minPasswordLength();
        if (pw.length < min) return "password must be at least " + min + " characters";
        var max = maxPasswordLength();
        if (max && pw.length > max) return "password must be at most " + max + " characters";
        if (isObviousPassword(pw, identity)) return "password can't be built from your name";
        try {
            if (typeof system.trashcan === "function" && system.trashcan("password", pw))
                return "that password is too common - pick another";
        } catch (e) { }
        try {
            if (typeof system.check_password === "function" && !system.check_password(pw))
                return "password needs more variety";
        } catch (e) { }
        return null;
    }

    var moduleExports = {
        MIN_PASS_LEN: MIN_PASS_LEN,
        realNameFromAlias: realNameFromAlias,
        deriveRealName: deriveRealName,
        isObviousPassword: isObviousPassword,
        minPasswordLength: minPasswordLength,
        maxPasswordLength: maxPasswordLength,
        passwordProblem: passwordProblem
    };

    var _global = (typeof globalThis !== "undefined") ? globalThis
        : (typeof js !== "undefined" && js && js.global) ? js.global : undefined;
    if (_global) {
        try { _global.UserPolicy = moduleExports; } catch (e) { }
    }

    return moduleExports;

})();
