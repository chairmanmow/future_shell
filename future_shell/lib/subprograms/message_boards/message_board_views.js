"use strict";

if (typeof lazyLoadModule !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

(function (global) {
    function BaseView(board, id, options) {
        this.board = board || null;
        this.id = id || '';
        this.options = options || {};
    }

    BaseView.prototype.enter = function () { };
    BaseView.prototype.exit = function () { };
    BaseView.prototype.handleKey = function () { return true; };
    BaseView.prototype.resume = function () { };
    BaseView.prototype.suspend = function () { };

    function LegacyView(board, config) {
        config = config || {};
        BaseView.call(this, board, config.id || config.viewId || '');
        this._render = config.render || config.enter || null;
        this._handle = config.handle || null;
        this._exit = config.exit || null;
        this._resume = config.resume || null;
        this._suspend = config.suspend || null;
    }

    LegacyView.prototype = Object.create(BaseView.prototype);
    LegacyView.prototype.constructor = LegacyView;

    LegacyView.prototype.enter = function () {
        return this._invoke(this._render, arguments);
    };

    LegacyView.prototype.handleKey = function () {
        return this._invoke(this._handle, arguments, true);
    };

    LegacyView.prototype.exit = function () {
        return this._invoke(this._exit, arguments);
    };

    LegacyView.prototype.resume = function () {
        return this._invoke(this._resume, arguments);
    };

    LegacyView.prototype.suspend = function () {
        return this._invoke(this._suspend, arguments);
    };

    LegacyView.prototype._invoke = function (target, argsLike, defaultReturn) {
        var board = this.board;
        if (!board || !target) {
            return (typeof defaultReturn === 'undefined') ? undefined : defaultReturn;
        }
        var fn = target;
        if (typeof target === 'string') fn = board[target];
        if (typeof fn !== 'function') {
            return (typeof defaultReturn === 'undefined') ? undefined : defaultReturn;
        }
        var args = [];
        if (argsLike && argsLike.length) {
            for (var i = 0; i < argsLike.length; i++) args.push(argsLike[i]);
        }
        var result = fn.apply(board, args);
        if (typeof result === 'undefined' && typeof defaultReturn !== 'undefined') return defaultReturn;
        return result;
    };

    function createLegacyViewMap(board) {
        var map = {};
        if (!board) return map;
        map.group = new LegacyView(board, {
            id: 'group',
            render: '_renderGroupView',
            handle: '_handleGroupKey'
        });
        map.sub = new LegacyView(board, {
            id: 'sub',
            render: '_renderSubView',
            handle: '_handleSubKey'
        });
        map.threads = new LegacyView(board, {
            id: 'threads',
            render: '_renderThreadsView',
            handle: function (key) {
                if (this.threadTree) return this._handleThreadTreeKey(key);
                return this._handleThreadsKey(key);
            }
        });
        map.flat = new LegacyView(board, {
            id: 'flat',
            render: '_renderFlatView',
            handle: '_handleFlatKey',
            exit: function () {
                if (this._releaseHotspots) {
                    try { this._releaseHotspots(); } catch (_eFlatExit) { }
                }
            }
        });
        map.read = new LegacyView(board, {
            id: 'read',
            render: '_renderReadView',
            handle: '_handleReadKey',
            exit: function () {
                if (this._destroyReadFrames) {
                    try { this._destroyReadFrames(); } catch (_e) { }
                }
            }
        });
        map.search = new LegacyView(board, {
            id: 'search',
            render: '_renderSearchResults',
            handle: '_handleSearchKey'
        });
        return map;
    }

    function GroupView(board) {
        BaseView.call(this, board, 'group');
    }

    GroupView.prototype = Object.create(BaseView.prototype);
    GroupView.prototype.constructor = GroupView;

    GroupView.prototype.enter = function () {
        var board = this.board;
        if (!board) return;
        board._beginViewTransition('Rendering groups...');
        board._ensureFrames();
        try { if (board._destroyReadFrames) board._destroyReadFrames(); } catch (_ignored) { }
        try { board._destroyThreadUI(); } catch (_ignored2) { }
        try { board._clearIconGrid(); } catch (_ignored3) { }
        board._refreshTransitionOverlay();
        try {
            board.view = 'group';
            var items = buildGroupItems(board);
            board.items = items;
            if (board._computeNonSpecialOrdinals) board._computeNonSpecialOrdinals();
            board.selection = Math.min(board.selection, Math.max(0, items.length - 1));
            if (board.outputFrame) {
                try { board.outputFrame.clear(); board.outputFrame.cycle(); } catch (_ignored4) { }
            }
            if (board._paintIconGrid) board._paintIconGrid();
            board._writeStatus('GROUPS: Enter opens subs | Y=Scan | S=Search | ESC=Quit');
        } finally {
            board._endViewTransition();
        }
    };

    GroupView.prototype.handleKey = function (key) {
        var board = this.board;
        if (!board) return true;
        var metrics = board._calcGridMetrics ? board._calcGridMetrics() : { cols: 1, rows: board.items.length };
        var cols = metrics.cols || 1;
        var maxVisible = (metrics.cols || 1) * (metrics.rows || board.items.length);
        var oldSel = board.selection;
        if (key === KEY_LEFT) board.selection = Math.max(0, board.selection - 1);
        else if (key === KEY_RIGHT) board.selection = Math.min(board.items.length - 1, board.selection + 1);
        else if (key === KEY_UP) board.selection = Math.max(0, board.selection - cols);
        else if (key === KEY_DOWN) board.selection = Math.min(board.items.length - 1, board.selection + cols);
        else if (key === '\x0d' || key === '\n') return handleGroupEnter(board);
        else if (key === 'S' || key === 's' || key === '/') return promptGroupSearch(board);
        else if (key === 'Y' || key === 'y') {
            var scanIndex = board._findMenuIndexByType ? board._findMenuIndexByType('scan') : -1;
            if (scanIndex !== -1 && board.items[scanIndex] && typeof board.items[scanIndex].action === 'function') {
                board.selection = scanIndex;
                board.items[scanIndex].action();
                return false;
            }
        }
        else if (key === KEY_PAGEUP) board.selection = Math.max(0, board.selection - maxVisible);
        else if (key === KEY_PAGEDN) board.selection = Math.min(board.items.length - 1, board.selection + maxVisible);
        if (board.selection !== oldSel && board._paintIconGrid) board._paintIconGrid();
        return true;
    };

    GroupView.prototype.exit = function () {
        var board = this.board;
        if (!board) return;
        try { board._releaseHotspots(); } catch (_releaseErr) { }
    };

    function SubView(board) {
        BaseView.call(this, board, 'sub');
    }

    // Build the full list of group view items (including special cells).
    function buildGroupItems(board) {
        var items = [];
        items.push({
            type: 'quit',
            label: 'Quit',
            hotkey: '',
            iconFile: board._resolveBoardIcon('quit', 'quit'),
            iconBg: BG_RED,
            iconFg: WHITE,
            action: function () { board.exit(); }
        });
        items.push({
            type: 'scan',
            label: 'Scan For You',
            hotkey: 'Y',
            iconFile: board._resolveBoardIcon('mailbox', 'scan'),
            iconBg: BG_CYAN,
            iconFg: BLACK,
            action: function () {
                if (!board || typeof board._scanMessagesAddressedToUser !== 'function') return;
                board._scanMessagesAddressedToUser({ refreshView: true });
            }
        });
        items.push({
            type: 'search',
            label: 'Search',
            hotkey: 'S',
            iconFile: board._resolveBoardIcon('search', 'search'),
            iconBg: BG_BLUE,
            iconFg: WHITE,
            action: function () { board._promptSearch(null, 'group', 'all'); }
        });
        for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
            var grp = msg_area.grp_list[gi];
            if (!grp || !grp.sub_list || !grp.sub_list.length) continue;
            items.push({
                type: 'group',
                label: grp.name.substr(0, 12),
                hotkey: (grp.name && grp.name.length ? grp.name[0].toUpperCase() : null),
                iconFile: board._resolveBoardIcon(grp.name, 'group'),
                iconBg: BG_BLUE,
                iconFg: WHITE,
                groupIndex: gi
            });
        }
        return items;
    }

    // Handle Enter in the groups grid.
    function handleGroupEnter(board) {
        var item = board.items[board.selection];
        if (!item) return false;
        if (item.action && typeof item.action === 'function') {
            item.action();
            return false;
        }
        if (item.type === 'group') {
            board._renderSubView(item.groupIndex);
            return false;
        }
        return false;
    }

    function promptGroupSearch(board) {
        board._promptSearch(null, 'group', 'all');
        return false;
    }

    SubView.prototype = Object.create(BaseView.prototype);
    SubView.prototype.constructor = SubView;

    SubView.prototype.enter = function (group) {
        var board = this.board;
        if (!board) return;
        board.view = 'sub';
        board._beginViewTransition('Rendering subs...');
        board._ensureFrames();
        try {
            try { if (board._destroyReadFrames) board._destroyReadFrames(); } catch (_ignored) { }
            try { board._destroyThreadUI(); } catch (_ignored2) { }
            try { board._clearIconGrid(); } catch (_ignored3) { }
            board._refreshTransitionOverlay();
            board.items = buildSubItems(board, group);
            if (board._computeNonSpecialOrdinals) board._computeNonSpecialOrdinals();
            board.selection = 0;
            board.scrollOffset = 0;
            if (board.outputFrame) {
                try { board.outputFrame.clear(); board.outputFrame.cycle(); } catch (_ignored4) { }
            }
            if (board._paintIconGrid) board._paintIconGrid();
            board._writeStatus('SUBS: Enter opens reader | S=Search | Backspace=Groups | ' + (board.selection + 1) + '/' + board.items.length);
        } finally {
            board._endViewTransition();
        }
    };

    SubView.prototype.handleKey = function (key) {
        var board = this.board;
        if (!board) return true;
        var metrics = board._calcGridMetrics ? board._calcGridMetrics() : { cols: 1, rows: board.items.length };
        var cols = metrics.cols || 1;
        var maxVisible = (metrics.cols || 1) * (metrics.rows || board.items.length);
        var oldSel = board.selection;
        if (key === KEY_LEFT) board.selection = Math.max(0, board.selection - 1);
        else if (key === KEY_RIGHT) board.selection = Math.min(board.items.length - 1, board.selection + 1);
        else if (key === KEY_UP) board.selection = Math.max(0, board.selection - cols);
        else if (key === KEY_DOWN) board.selection = Math.min(board.items.length - 1, board.selection + cols);
        else if (key === '\x08') { board._renderGroupView(); return false; }
        else if (key === '\x0d' || key === '\n') return handleSubEnter(board);
        else if (key === 'S' || key === 's' || key === '/') return promptSubSearch(board);
        else if (key === KEY_PAGEUP) board.selection = Math.max(0, board.selection - maxVisible);
        else if (key === KEY_PAGEDN) board.selection = Math.min(board.items.length - 1, board.selection + maxVisible);
        return updateSelection(board, oldSel);
    };

    SubView.prototype.exit = function () {
        var board = this.board;
        if (!board) return;
        try { board._releaseHotspots(); } catch (_releaseErr) { }
    };

    function ThreadsView(board) {
        BaseView.call(this, board, 'threads');
    }

    // Build the submenu tiles for the current group.
    function buildSubItems(board, group) {
        if (typeof group !== 'undefined' && group !== null) board.curgrp = group;
        if ((typeof board.curgrp !== 'number' || isNaN(board.curgrp)) && msg_area && msg_area.grp_list && msg_area.grp_list.length) {
            var derived = board._syncSubState ? board._syncSubState(board.cursub || board._lastActiveSubCode || bbs.cursub_code || null) : null;
            if (derived && typeof derived.groupIndex === 'number') board.curgrp = derived.groupIndex;
        }
        if (typeof board.curgrp !== 'number' || isNaN(board.curgrp) || board.curgrp < 0) board.curgrp = 0;
        var grp = (msg_area && msg_area.grp_list) ? msg_area.grp_list[board.curgrp] : null;
        if (!grp) grp = { sub_list: [] };
        var list = [
            {
                type: 'groups',
                label: 'Groups',
                hotkey: '',
                iconFile: board._resolveBoardIcon('groups', 'groups'),
                iconBg: BG_GREEN,
                iconFg: BLACK
            },
            {
                type: 'search',
                label: 'Search',
                hotkey: 'S',
                iconFile: board._resolveBoardIcon('search', 'search'),
                iconBg: BG_BLUE,
                iconFg: WHITE,
                action: function () { board._promptSearch(null, 'sub', 'group'); }
            }
        ];
        for (var si = 0; si < grp.sub_list.length; si++) {
            var sub = grp.sub_list[si];
            var subName = (sub.name || sub.code || '').substr(0, 12);
            var totalMessages = board._getSubMessageCount ? board._getSubMessageCount(sub.code) : 0;
            var unreadMessages = board._getSubUnreadCount ? board._getSubUnreadCount(sub.code, totalMessages) : 0;
            var labelInfo = board._formatSubLabel ? board._formatSubLabel(subName, totalMessages, unreadMessages) : { text: subName, segments: null };
            list.push({
                type: 'sub',
                label: labelInfo.text,
                hotkey: (sub.name && sub.name.length ? sub.name[0].toUpperCase() : null),
                iconFile: board._resolveBoardIcon(sub.code || sub.name, 'sub'),
                iconBg: BG_CYAN,
                iconFg: BLACK,
                subCode: sub.code,
                _labelBase: subName,
                _labelSegments: labelInfo.segments,
                _messageCount: totalMessages,
                _unreadCount: unreadMessages
            });
        }
        if (grp.sub_list && grp.sub_list.length && !board._lastActiveSubCode) board._lastActiveSubCode = grp.sub_list[0].code;
        return list;
    }

    // Handle Enter within the subs grid.
    function handleSubEnter(board) {
        var item = board.items[board.selection];
        if (!item) return false;
        if (item.type === 'groups') { board._renderGroupView(); return false; }
        if (item.type === 'search') {
            if (item.action && typeof item.action === 'function') {
                item.action();
            }
            return false;
        }
        if (item.type === 'sub') {
            var hasUnread = board._subHasUnread ? board._subHasUnread(item.subCode, item._messageCount) : ((item._unreadCount || 0) > 0);
            if (hasUnread) board._openSubReader(item.subCode);
            else board._renderFlatView({ subCode: item.subCode });
            return false;
        }
        return false;
    }

    function promptSubSearch(board) {
        board._searchReturnView = 'sub';
        dbug('[SUBSEARCH] Calling _promptSearch with args: null, "sub", "group"', 'messageboard');
        board._promptSearch(null, 'sub', 'group');
        return false;
    }

    function updateSelection(board, oldSelection) {
        if (board.selection !== oldSelection) {
            var current = board.items[board.selection];
            if (current && current.subCode) board._lastActiveSubCode = current.subCode;
            if (board._paintIconGrid) board._paintIconGrid();
        }
        return true;
    }

    ThreadsView.prototype = Object.create(BaseView.prototype);
    ThreadsView.prototype.constructor = ThreadsView;

    ThreadsView.prototype.enter = function (sub) {
        var board = this.board;
        if (!board) return;
        var previousCode = board.cursub || board._lastActiveSubCode || board._cachedSubCode || bbs.cursub_code || null;
        var state = board._syncSubState ? board._syncSubState(sub || previousCode) : null;
        var code = state && state.code ? state.code : (board.cursub || board._lastActiveSubCode || bbs.cursub_code);
        if (!code) return;
        board.cursub = code;
        board._lastActiveSubCode = code;
        var subChanged = previousCode && code !== previousCode;
        board.view = 'threads';
        board._releaseHotspots();
        dbug('MessageBoard: enter threads view sub=' + code, 'messageboard');
        board._showTransitionNotice('Loading thread list...');
        var transitionHost = board.hostFrame || board.parentFrame || board.rootFrame || (board.outputFrame ? (board.outputFrame.parent || board.outputFrame) : null) || null;
        board._beginViewTransition('Rendering threads...', { host: transitionHost });
        board._ensureFrames();
        try { if (board._destroyReadFrames) board._destroyReadFrames(); } catch (_e1) { }
        if (typeof board._clearIconGrid === 'function') board._clearIconGrid();
        if (typeof board._destroyThreadUI === 'function') board._destroyThreadUI();
        board._refreshTransitionOverlay();
        if (!board._fullHeaders) board._fullHeaders = {};
        if (!board._threadSequenceCache) board._threadSequenceCache = {};
        if (subChanged) {
            board.threadTreeSelection = 0;
            board.threadHeaders = [];
            board.threadNodeIndex = [];
            board.threadTree = null;
            board.threadScrollOffset = 0;
            board.threadSelection = 0;
        }
        if (typeof board._ensureThreadContentFrame === 'function') board._ensureThreadContentFrame();
        board._refreshTransitionOverlay();
        var contentFrame = board._threadContentFrame || board.outputFrame;
        try { if (contentFrame) { contentFrame.clear(); contentFrame.gotoxy(1, 1); contentFrame.putmsg('Building thread list...'); contentFrame.cycle(); } } catch (_e2) { }
        board._refreshTransitionOverlay();
        try {
            if (typeof board._loadThreadHeaders === 'function') board._loadThreadHeaders();
            if (typeof board._ensureTreeLib === 'function') board._ensureTreeLib();
            if (typeof board._buildThreadTree === 'function') board._buildThreadTree();
            if (!board.threadHeaders.length) {
                if (contentFrame) {
                    try {
                        contentFrame.clear();
                        contentFrame.gotoxy(2, 2);
                        contentFrame.putmsg('No messages. Press P to post the first message.');
                    } catch (_e3) { }
                }
                board._hideTransitionNotice();
                board._writeStatus('THREADS: P=Post  S=Search  Backspace=Subs  0/0');
                return;
            }
            board.threadTreeSelection = Math.min(board.threadTreeSelection, Math.max(0, board.threadNodeIndex.length - 1));
            if (board.threadTree && board.threadNodeIndex.length) {
                if (typeof board._paintThreadTree === 'function') board._paintThreadTree();
            } else {
                dbug('MessageBoard: thread tree empty, fallback list', 'messageboard');
                board.threadSelection = 0;
                board.threadScrollOffset = 0;
                if (typeof board._paintThreadList === 'function') board._paintThreadList();
            }
        } finally {
            board._hideTransitionNotice();
            board._endViewTransition();
        }
    };

    ThreadsView.prototype.handleKey = function (key) {
        var board = this.board;
        if (!board) return true;
        if (key === 'F' || key === 'f') {
            var anchor = null;
            if (board.threadTree && board.threadNodeIndex && board.threadNodeIndex.length) {
                var node = board.threadNodeIndex[Math.max(0, Math.min(board.threadTreeSelection || 0, board.threadNodeIndex.length - 1))];
                if (node && node.__msgHeader && typeof node.__msgHeader.number === 'number') anchor = node.__msgHeader.number;
            } else if (board.threadHeaders && board.threadHeaders.length) {
                var sel = Math.max(0, Math.min(board.threadSelection || 0, board.threadHeaders.length - 1));
                var hdr = board.threadHeaders[sel];
                if (hdr && typeof hdr.number === 'number') anchor = hdr.number;
            }
            board._renderFlatView({ anchorNumber: anchor });
            return false;
        }
        if (key === 'O' || key === 'o') {
            if (typeof board._toggleThreadSortOrder === 'function') board._toggleThreadSortOrder();
            return false;
        }
        if (key === '/' || key === 's' || key === 'S') {
            if (typeof board._promptSearch === 'function') {
                board._promptSearch(board.cursub || board._lastActiveSubCode || null, 'threads');
            }
            return false;
        }
        if (board.threadTree) {
            return threadsHandleTreeKey(board, key);
        }
        return threadsHandleListKey(board, key);
    };

    ThreadsView.prototype.exit = function () {
        var board = this.board;
        if (!board) return;
        try { board._releaseHotspots(); } catch (_releaseErr) { }
    };

    function FlatView(board) {
        BaseView.call(this, board, 'flat');
    }

    FlatView.prototype = Object.create(BaseView.prototype);
    FlatView.prototype.constructor = FlatView;

    FlatView.prototype.enter = function () {
        var board = this.board;
        if (!board || typeof board._renderFlatView !== 'function') return;
        var args = [];
        for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
        board._renderFlatView.apply(board, args);
    };

    FlatView.prototype.handleKey = function (key) {
        var board = this.board;
        if (!board || typeof board._handleFlatKey !== 'function') return true;
        return board._handleFlatKey(key);
    };

    FlatView.prototype.exit = function () {
        var board = this.board;
        if (!board) return;
        try { board._releaseHotspots(); } catch (_flatExitErr) { }
    };

    // Thread-tree key handling (tree.js backed view).
    function threadsHandleTreeKey(board, key) {
        if (!board.threadTree) return true;
        switch (key) {
            case KEY_UP:
                board.threadTreeSelection = Math.max(0, board.threadTreeSelection - 1);
                if (board._paintThreadTree) board._paintThreadTree();
                return true;
            case KEY_DOWN:
                board.threadTreeSelection = Math.min(board.threadNodeIndex.length - 1, board.threadTreeSelection + 1);
                if (board._paintThreadTree) board._paintThreadTree();
                return true;
            case KEY_HOME:
                board.threadTreeSelection = 0;
                if (board._paintThreadTree) board._paintThreadTree();
                return true;
            case KEY_END:
                board.threadTreeSelection = board.threadNodeIndex.length - 1;
                if (board._paintThreadTree) board._paintThreadTree();
                return true;
            case '\x08':
            case 'Q':
            case '\x1B':
                board._renderSubView(board.curgrp);
                return false;
            case ' ':
                var node = board.threadNodeIndex[board.threadTreeSelection];
                if (node && node.__isTree) {
                    if (node.status & node.__flags__.CLOSED) node.open(); else node.close();
                    if (board._paintThreadTree) board._paintThreadTree();
                }
                return true;
            case '\r':
            case '\n': {
                var node2 = board.threadNodeIndex[board.threadTreeSelection];
                if (!node2) return true;
                if (node2.__isTree) {
                    if (node2.status & node2.__flags__.CLOSED) node2.open();
                    else if (node2.items && node2.items.length) node2.open();
                    if (board._paintThreadTree) board._paintThreadTree();
                    return true;
                }
                if (node2.__msgHeader) {
                    if (typeof board._setReadMode === 'function') board._setReadMode('thread');
                    board._readReturnView = 'threads';
                    board._readReturnAnchor = node2.__msgHeader.number || null;
                    if (typeof board._ensureThreadReadContextFromThreads === 'function') board._ensureThreadReadContextFromThreads(node2.__msgHeader);
                    board._renderReadView(node2.__msgHeader);
                    return false;
                }
                return true;
            }
            case 'P':
            case 'p':
                board._renderPostView();
                return false;
            case 'R':
            case 'r': {
                var sel = board.threadNodeIndex[board.threadTreeSelection];
                if (sel && sel.__msgHeader) {
                    board._renderPostView({ replyTo: sel.__msgHeader });
                    return false;
                }
                return true;
            }
            default:
                return true;
        }
    }

    // Fallback list-mode thread navigation.
    function threadsHandleListKey(board, key) {
        var headers = board._getThreadViewHeaders ? board._getThreadViewHeaders() : board.threadHeaders;
        if (!headers || !headers.length) {
            if (key === 'P' || key === 'p') { board._renderPostView(); return false; }
            if (key === '\x08') { board._renderSubView(board.curgrp); return false; }
            return true;
        }
        var oldSel = board.threadSelection;
        var frame = board._threadContentFrame || board.outputFrame;
        var usable = frame ? frame.height - 2 : 10;
        if (usable < 3) usable = frame ? frame.height : 10;
        switch (key) {
            case KEY_UP: board.threadSelection = Math.max(0, board.threadSelection - 1); break;
            case KEY_DOWN: board.threadSelection = Math.min(headers.length - 1, board.threadSelection + 1); break;
            case KEY_PAGEUP: board.threadSelection = Math.max(0, board.threadSelection - usable); break;
            case KEY_PAGEDN: board.threadSelection = Math.min(headers.length - 1, board.threadSelection + usable); break;
            case KEY_HOME: board.threadSelection = 0; break;
            case KEY_END: board.threadSelection = headers.length - 1; break;
            case '\x08':
                board._renderSubView(board.curgrp);
                return false;
            case 'P': case 'p':
                board._renderPostView();
                return false;
            case 'R': case 'r': {
                var rh = headers[board.threadSelection];
                if (rh) board._renderPostView({ replyTo: rh });
                return false;
            }
            case 'O': case 'o':
                if (typeof board._toggleThreadSortOrder === 'function') {
                    board._toggleThreadSortOrder();
                }
                return false;
            case '\r':
            case '\n': {
                var hdr = headers[board.threadSelection];
                if (hdr) {
                    if (typeof board._setReadMode === 'function') board._setReadMode('thread');
                    board._readReturnView = 'threads';
                    board._readReturnAnchor = hdr.number || null;
                    if (typeof board._ensureThreadReadContextFromThreads === 'function') board._ensureThreadReadContextFromThreads(hdr);
                    board._renderReadView(hdr);
                }
                return false;
            }
            default:
                return true;
        }
        if (board.threadSelection !== oldSel && board._paintThreadList) board._paintThreadList();
        return true;
    }

    function ReadView(board) {
        BaseView.call(this, board, 'read');
    }

    ReadView.prototype = Object.create(BaseView.prototype);
    ReadView.prototype.constructor = ReadView;

    ReadView.prototype.enter = function (msg) {
        var board = this.board;
        if (!board || !msg) return;
        board._beginViewTransition('Rendering message...');
        board.view = 'read';
        board._releaseHotspots();
        board._hotspotMap = {};
        board.lastReadMsg = msg;
        if (typeof board._storeFullHeader === 'function') board._storeFullHeader(msg);
        if (!board.outputFrame) board._ensureFrames();
        try {
            if (board._destroyReadFrames) board._destroyReadFrames();
            var f = board.outputFrame; if (f) f.clear();
            if (!bbs.mods) bbs.mods = {};
            if (!bbs.mods.avatar_lib) {
                try {
                    if (!bbs.mods.avatar_lib) {
                        bbs.mods.avatar_lib = lazyLoadModule('avatar_lib.js', { cacheKey: 'avatar_lib' });
                    }
                } catch (_e) { }
            }
            board._avatarLib = bbs.mods.avatar_lib || null;
            var avh = (board._avatarLib && board._avatarLib.defs && board._avatarLib.defs.height) || 6;
            var headerH = Math.min(avh + 1, f ? f.height - 1 : avh + 1);  // +1 for separator row
            var headerAttr = (board && typeof board.paletteAttr === 'function')
                ? board.paletteAttr('READ_HEADER', BG_BLUE | WHITE)
                : (BG_BLUE | WHITE);
            var headerFrame = f ? new Frame(f.x, f.y, f.width, headerH, headerAttr, f.parent) : null;
            var bodyY = headerFrame ? headerFrame.y + headerFrame.height : (f ? f.y : 1);
            var bodyAvailable = f ? Math.max(1, f.y + f.height - bodyY) : 1;
            var reserveInputRow = (board && board.inputFrame);
            var bodyH = reserveInputRow && bodyAvailable > 1 ? bodyAvailable - 1 : bodyAvailable;
            var bodyAttr = (board && typeof board.paletteAttr === 'function')
                ? board.paletteAttr('OUTPUT_FRAME', (f && typeof f.attr === 'number') ? f.attr : (BG_BLACK | LIGHTGRAY))
                : ((f && typeof f.attr === 'number') ? f.attr : (BG_BLACK | LIGHTGRAY));
            var bodyFrame = f ? new Frame(f.x, bodyY, f.width, bodyH, bodyAttr, f.parent) : null;
            try { if (headerFrame) headerFrame.open(); if (bodyFrame) bodyFrame.open(); } catch (_e2) { }
            board._readHeaderFrame = headerFrame;
            board._readBodyFrame = bodyFrame;
            if (board.inputFrame && bodyFrame) {
                var inputY = bodyFrame.y + bodyFrame.height;
                try { board.inputFrame.move(board.inputFrame.x, inputY); } catch (_readMoveErr) { }
                try { board.inputFrame.clear(board.inputFrame.attr); } catch (_readClrErr) { }
            }
            if (board._ensureReadBodyCanvas) board._ensureReadBodyCanvas();
            if (board._paintReadHeader) board._paintReadHeader(msg);
            var code = board.cursub || (msg.sub || null) || board._lastActiveSubCode || bbs.cursub_code;
            var fullHeader = msg;
            var bodyText = '';
            if (code && msg && typeof msg.number === 'number') {
                var mb = new MsgBase(code);
                if (mb.open()) {
                    try {
                        var cached = (board._fullHeaders && board._fullHeaders[msg.number]) || null;
                        if (!cached) {
                            try { cached = mb.get_msg_header(false, msg.number, true); } catch (_e3) { cached = null; }  // by_offset=false, msg.number is message NUMBER
                            if (cached && board._storeFullHeader) board._storeFullHeader(cached);
                        }
                        if (cached) fullHeader = cached;
                        if (fullHeader && board._storeFullHeader) board._storeFullHeader(fullHeader);
                        // Repaint header with full header data (includes proper date fields)
                        if (fullHeader && board._paintReadHeader) board._paintReadHeader(fullHeader);
                        if (board._readMessageBody) bodyText = board._readMessageBody(mb, fullHeader) || '';
                        board.currentMessageRawBody = bodyText; // capture unmodified raw body
                    } finally {
                        try { mb.close(); } catch (_e4) { }
                    }
                }
            }
            board.lastReadMsg = fullHeader;
            if (board._updateScanPointer) board._updateScanPointer(fullHeader);
            board._readScroll = 0;
            var bodyInfo = board._sanitizeFtnBody ? board._sanitizeFtnBody(bodyText) : { text: bodyText, metadata: null };
            board._readMessageMetadata = bodyInfo.metadata || null;
            var displayBody = bodyInfo.text || '';
            if (board._setReadBodyText) board._setReadBodyText(displayBody);
            if (board._renderReadBodyContent) board._renderReadBodyContent(displayBody);
            // Persist current header/body for reply quoting regardless of later frame destruction
            board.currentMessageHeader = fullHeader;
            board.currentMessageBody = displayBody;
            if (!board.currentMessageRawBody) board.currentMessageRawBody = displayBody; // fallback if raw missing
            if (board._paintRead) board._paintRead();
        } finally {
            board._endViewTransition();
        }
    };

    ReadView.prototype.handleKey = function (key) {
        var board = this.board;
        if (!board || board.view !== 'read') return true;
        var canvas = board._readBodyCanvas || null;
        var usable;
        var maxStart;
        if (canvas) {
            usable = canvas.height || 0;
            if (usable < 1) usable = 1;
            var totalLines = canvas.data_height || 0;
            maxStart = Math.max(0, totalLines - usable);
        } else {
            var f = board._readBodyFrame || board.outputFrame;
            usable = f ? f.height - 1 : 20;
            if (usable < 1) usable = 1;
            var lines = board._getReadLines ? board._getReadLines() : [];
            maxStart = Math.max(0, (lines.length - usable));
        }
        var mode = (typeof board._getReadMode === 'function')
            ? board._getReadMode()
            : (board._readMode || (board._readThreadContext && board._readThreadContext.mode) || 'thread');
        switch (key) {
            case KEY_UP:
                board._readScroll = Math.max(0, (board._readScroll || 0) - 1);
                board._paintRead && board._paintRead();
                return true;
            case KEY_DOWN:
                board._readScroll = Math.min(maxStart, (board._readScroll || 0) + 1);
                board._paintRead && board._paintRead();
                return true;
            case KEY_PAGEUP:
                board._readScroll = Math.max(0, (board._readScroll || 0) - usable);
                board._paintRead && board._paintRead();
                return true;
            case KEY_PAGEDN:
                board._readScroll = Math.min(maxStart, (board._readScroll || 0) + usable);
                board._paintRead && board._paintRead();
                return true;
            case KEY_HOME:
                board._readScroll = 0;
                board._paintRead && board._paintRead();
                return true;
            case KEY_END:
                board._readScroll = maxStart;
                board._paintRead && board._paintRead();
                return true;
            case KEY_LEFT:
                if (mode === 'flat') return true;
                if (board._openAdjacentThread && board._openAdjacentThread(-1)) return false;
                return true;
            case KEY_RIGHT:
                if (mode === 'flat') return true;
                if (board._openAdjacentThread && board._openAdjacentThread(1)) return false;
                return true;
            case KEY_ENTER:
            case '\r':
            case '\n':
                if (canvas) {
                    var current = board._readScroll || 0;
                    if (current < maxStart) {
                        board._readScroll = Math.min(maxStart, current + usable);
                        board._paintRead && board._paintRead();
                        return true;
                    }
                }
                if ((board._readScroll || 0) < maxStart) {
                    board._readScroll = Math.min(maxStart, (board._readScroll || 0) + usable);
                    board._paintRead && board._paintRead();
                    return true;
                }
                var advanced = false;
                if (mode === 'flat') {
                    if (board._advanceFlatRead) advanced = board._advanceFlatRead(1);
                } else {
                    if (board._openRelativeInThread) advanced = board._openRelativeInThread(1);
                    if (!advanced && board._openAdjacentThread) advanced = board._openAdjacentThread(1);
                }
                if (advanced) return false;
                if (mode === 'flat') {
                    if (board._showReadNotice) {
                        try { board._showReadNotice('end-of-flat'); } catch (_eFlatEnd) { }
                    }
                    var anchor = board.lastReadMsg && typeof board.lastReadMsg.number === 'number' ? board.lastReadMsg.number : null;
                    board._renderFlatView(anchor !== null ? { anchorNumber: anchor } : {});
                    return false;
                }
                if (board._showReadNotice) {
                    try { board._showReadNotice('end-of-sub'); } catch (_eEndNotice) { }
                }
                board._renderSubView(board.curgrp);
                return false;
            case '\x7f':
            case '\x08':
                if (mode === 'flat') {
                    if (board._advanceFlatRead && board._advanceFlatRead(-1)) return false;
                    return true;
                }
                if (board._openRelativeInThread && board._openRelativeInThread(-1)) return false;
                if (board._openAdjacentThread && board._openAdjacentThread(-1)) return false;
                return true;
            case 'R': case 'r':
                if (board.lastReadMsg) { board._renderPostView({ replyTo: board.lastReadMsg }); return false; }
                return true;
            case 'P': case 'p':
                board._renderPostView();
                return false;
            case '\x12':
                if (board.lastReadMsg) board._renderReadView(board.lastReadMsg);
                return true;
            case 'S': case 's': case '/':
                board._promptSearch(board.cursub || board._lastActiveSubCode || null, 'read');
                return false;
            default:
                return undefined; // Allow fallthrough to board._handleReadKey for other keys
        }
    };

    ReadView.prototype.exit = function () {
        var board = this.board;
        if (!board) return;
        try { board._hideReadNotice({ skipRepaint: true }); } catch (_rnErr) { }
        if (typeof board._destroyReadFrames === 'function') {
            try { board._destroyReadFrames(); } catch (_drErr) { }
        }
    };

    function SearchView(board) {
        BaseView.call(this, board, 'search');
    }

    SearchView.prototype = Object.create(BaseView.prototype);
    SearchView.prototype.constructor = SearchView;

    SearchView.prototype.enter = function () {
        var board = this.board;
        if (!board) return;
        var preserveState = arguments.length ? arguments[0] : undefined;
        if (board._destroyReadFrames) {
            try { board._destroyReadFrames(); } catch (_e1) { }
        }
        if (board._destroyThreadUI) board._destroyThreadUI();
        board._ensureFrames();
        board._beginViewTransition('Rendering search results...');
        try {
            board._releaseHotspots();
            if (board._clearIconGrid) board._clearIconGrid();
            board.view = 'search';
            if (!board.outputFrame) return;
            if (!board._searchResults || !board._searchResults.length) {
                try { board.outputFrame.clear(); board.outputFrame.putmsg('No matches found.'); } catch (_e2) { }
                board._writeStatus('SEARCH: No matches');
                return;
            }
            if (!preserveState) {
                board._searchSelection = Math.max(0, Math.min(board._searchSelection, board._searchResults.length - 1));
                board._searchScrollOffset = Math.min(board._searchScrollOffset, board._searchSelection);
            }
            paintSearchResults(board);
        } finally {
            board._endViewTransition();
        }
    };

    SearchView.prototype.handleKey = function (key) {
        var board = this.board;
        if (!board) return true;
        if (board.view !== 'search') return true;
        if (key === '\x1b' || key === '\x08') {
            board._exitSearchResults();
            return false;
        }
        if (!board._searchResults || !board._searchResults.length) return true;
        var usable = board.outputFrame ? Math.max(1, board.outputFrame.height - 2) : board._searchResults.length;
        var oldSel = board._searchSelection;
        if (key === KEY_UP) board._searchSelection = Math.max(0, board._searchSelection - 1);
        else if (key === KEY_DOWN) board._searchSelection = Math.min(board._searchResults.length - 1, board._searchSelection + 1);
        else if (key === KEY_PAGEUP) board._searchSelection = Math.max(0, board._searchSelection - usable);
        else if (key === KEY_PAGEDN) board._searchSelection = Math.min(board._searchResults.length - 1, board._searchSelection + usable);
        else if (key === KEY_HOME) board._searchSelection = 0;
        else if (key === KEY_END) board._searchSelection = board._searchResults.length - 1;
        else if (key === '\r' || key === '\n' || key === KEY_ENTER) {
            var item = board._searchResults[board._searchSelection];
            if (item && item.header) {
                var searchMode = (board._searchReturnView === 'flat') ? 'flat' : 'thread';
                if (typeof board._setReadMode === 'function') board._setReadMode(searchMode);
                if (searchMode === 'flat') board._readThreadContext = null;
                board._readReturnView = 'search';
                board._readReturnAnchor = (item.header && typeof item.header.number === 'number') ? item.header.number : null;
                if (board._syncSubState) board._syncSubState(item.code || board.cursub);
                board._renderReadView(item.header);
            }
            return false;
        } else {
            return true;
        }
        if (board._searchSelection !== oldSel) paintSearchResults(board);
        return true;
    };

    SearchView.prototype.exit = function () {
        var board = this.board;
        if (!board) return;
        try { board._releaseHotspots(); } catch (_releaseErr) { }
    };

    // Paint paginated search results with hotspot mapping.
    function paintSearchResults(board) {
        var f = board.outputFrame; if (!f) return;
        try { f.clear(); } catch (_e) { }
        
        // Determine scope label for header (check if results span multiple subs)
        var scopeLabel = '';
        var resultCodes = {};
        if (board._searchResults && board._searchResults.length > 0) {
            for (var j = 0; j < board._searchResults.length; j++) {
                var r = board._searchResults[j];
                if (r && r.code) resultCodes[r.code] = true;
            }
        }
        var numSubs = Object.keys(resultCodes).length;
        if (numSubs > 1) {
            // Results from multiple subs - try to determine if all in same group
            var grpName = (msg_area && msg_area.grp_list && typeof board.curgrp === 'number' && msg_area.grp_list[board.curgrp]) 
                ? msg_area.grp_list[board.curgrp].name 
                : null;
            scopeLabel = grpName ? (grpName + ' (' + numSubs + ' subs)') : (numSubs + ' subs');
        } else {
            scopeLabel = board._getCurrentSubName ? board._getCurrentSubName() : '';
        }
        
        // Build header using theme colors
        var searchLabel = (typeof board.colorize === 'function') ? board.colorize('SEARCH_HEADER_LABEL', 'Search ') : '\x01h\x01cSearch ';
        var queryText = (typeof board.colorize === 'function') ? board.colorize('SEARCH_HEADER_QUERY', '"' + board._searchQuery + '"') : '\x01h\x01y"' + board._searchQuery + '"';
        var inLabel = (typeof board.colorize === 'function') ? board.colorize('SEARCH_HEADER_LABEL', ' in ') : '\x01h\x01c in ';
        var subName = (typeof board.colorize === 'function') ? board.colorize('SEARCH_HEADER_QUERY', scopeLabel) : '\x01h\x01y' + scopeLabel;
        var countLabel = (typeof board.colorize === 'function') ? board.colorize('SEARCH_HEADER_LABEL', ' (' + board._searchResults.length + ' results)') : '\x01h\x01c (' + board._searchResults.length + ' results)\x01n';
        var header = searchLabel + queryText + inLabel + subName + countLabel;
        if (header.length > f.width) header = header.substr(0, f.width);
        try { f.gotoxy(1, 1); f.putmsg(header); } catch (_e1) { }
        var usable = Math.max(1, f.height - 2);
        if (board._searchSelection < board._searchScrollOffset) board._searchScrollOffset = board._searchSelection;
        if (board._searchSelection >= board._searchScrollOffset + usable) board._searchScrollOffset = Math.max(0, board._searchSelection - usable + 1);
        var end = Math.min(board._searchResults.length, board._searchScrollOffset + usable);
        board._releaseHotspots();
        if (!board._hotspotMap) board._hotspotMap = {};
        var hotspotChars = board._hotspotChars || [];
        var usedHotspots = 0;
        for (var i = board._searchScrollOffset; i < end; i++) {
            var res = board._searchResults[i];
            var lineY = 2 + (i - board._searchScrollOffset);
            if (lineY > f.height) break;
            var line = board._padLeft('' + res.number, 5, ' ') + ' ' + board._padRight((res.from || '').substr(0, 12), 12, ' ') + ' ' + (res.subject || '');
            if (res.snippet) line += ' - ' + res.snippet.replace(/\s+/g, ' ');
            if (line.length > f.width) line = line.substr(0, f.width - 3) + '...';
            var selected = (i === board._searchSelection);
            var rowColorKey = selected ? 'SEARCH_ROW_SELECTED' : 'SEARCH_ROW';
            var resume = (typeof board.colorCode === 'function') ? (board.colorCode(rowColorKey) || '\x01n') : (selected ? '\x01n\x01h' : '\x01n');
            if (board._highlightQuery) line = board._highlightQuery(line, board._searchQuery, resume);
            var rowPrefix = (typeof board.colorCode === 'function') ? (board.colorCode(rowColorKey) || '') : (selected ? '\x01n\x01h' : '\x01n');
            line = rowPrefix + line;
            try { f.gotoxy(1, lineY); f.putmsg(line); } catch (_e2) { }
            var cmd = null;
        if (usedHotspots < hotspotChars.length) cmd = hotspotChars[usedHotspots++];
        if (cmd) {
            board._hotspotMap[cmd] = 'search-result:' + i;
            if (typeof board._addHotspotArea === 'function') board._addHotspotArea(cmd, false, f.x, f.x + f.width - 1, f.y + lineY - 1);
            else if (typeof console.add_hotspot === 'function') {
                try { console.add_hotspot(cmd, false, f.x, f.x + f.width - 1, f.y + lineY - 1); } catch (_e3) { }
            }
        }
    }
    try { f.cycle(); } catch (_e4) { }
    board._writeStatus('SEARCH: Enter=Read  ESC/Bksp=Back  ' + (board._searchSelection + 1) + '/' + board._searchResults.length);
    if (typeof board._applyPendingHotspots === 'function') board._applyPendingHotspots();
}

    function PostView(board) {
        BaseView.call(this, board, 'post');
    }

    PostView.prototype = Object.create(BaseView.prototype);
    PostView.prototype.constructor = PostView;

    PostView.prototype.enter = function () {
        var board = this.board;
        if (!board) return;
        if (typeof board._renderPostViewCore === 'function') {
            return board._renderPostViewCore.apply(board, arguments);
        }
    };

    function ensurePostCleanup(board) {
        try { board._releaseHotspots(); } catch (_hsErr) { }
        try { if (typeof board._destroyReadFrames === 'function') board._destroyReadFrames(); } catch (_drErr) { }
    }

    PostView.prototype.exit = function () {
        var board = this.board;
        if (!board) return;
        ensurePostCleanup(board);
    };

    function createViewMap(board) {
        var map = createLegacyViewMap(board);
        if (board) {
            map.group = new GroupView(board);
            map.sub = new SubView(board);
            map.threads = new ThreadsView(board);
            map.flat = new FlatView(board);
            map.read = new ReadView(board);
            map.search = new SearchView(board);
            map.post = new PostView(board);
        }
        return map;
    }

    global.MessageBoardViews = {
        BaseView: BaseView,
        LegacyView: LegacyView,
        createLegacyViewMap: createLegacyViewMap,
        GroupView: GroupView,
        SubView: SubView,
        ThreadsView: ThreadsView,
        FlatView: FlatView,
        ReadView: ReadView,
        SearchView: SearchView,
        PostView: PostView,
        createViewMap: createViewMap
    };
})(this);
