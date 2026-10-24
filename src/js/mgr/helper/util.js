/**
 * BetterMediaBrowser - Shared helpers and state
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.util.state) {
        return;
    }

    BetterMediaBrowser.util.state = {
        drag: null,
        target: null,
        busy: false,
        requestToken: null,
        requestTimer: null,
        expandTimer: null,
        scanTimer: null,
        fallbackTimer: null,
        searchDiscoveryTimer: null,
        searchDiscoveryAttempts: 0,
        observer: null,
        pendingRoots: [],
        pendingSince: null,
        disabled: false
    };

    function debug(message, error) {
        if (!BetterMediaBrowser.config.debug) {
            return;
        }
        if (error) {
            console.log('[BetterMediaBrowser] ' + message, error);
        } else {
            console.log('[BetterMediaBrowser] ' + message);
        }
    }
    function hasClass(el, cls) {
        return !!(el && (' ' + (el.className || '') + ' ').indexOf(' ' + cls + ' ') !== -1);
    }
    function closestClass(el, cls, stopEl) {
        if (el && el.nodeType === 3) {
            el = el.parentNode;
        }
        while (el && el !== stopEl && el !== document) {
            if (hasClass(el, cls)) {
                return el;
            }
            el = el.parentNode;
        }
        if (el === stopEl && hasClass(el, cls)) {
            return el;
        }
        return null;
    }
    function isBrowserItem(el) {
        return hasClass(el, 'modx-browser-thumb-wrap') || hasClass(el, 'modx-browser-list-item');
    }
    function isBrowserView(cmp) {
        return !!(cmp && cmp.config && cmp.config.tree && cmp.store && cmp.lookup && typeof cmp.run === 'function' && typeof cmp.getSelectedNodes === 'function');
    }
    function findBrowserView(item) {
        var el = item;
        var cmp;
        while (el && el !== document.body) {
            if (el.id) {
                cmp = Ext.getCmp(el.id);
                if (isBrowserView(cmp)) {
                    return cmp;
                }
            }
            el = el.parentNode;
        }

        var found = null;
        Ext.ComponentMgr.all.each(function (cmp) {
            if (found || !isBrowserView(cmp) || !cmp.getEl || !cmp.getEl()) {
                return;
            }
            var dom = cmp.getEl().dom;
            if (dom && (dom === item || (dom.contains && dom.contains(item)))) {
                found = cmp;
            }
        });
        return found;
    }
    function getRecordData(view, item) {
        var record = null;
        try {
            if (view.getRecord) {
                record = view.getRecord(item);
            }
        } catch (e) {
            debug('getRecord() failed', e);
        }

        if (record && record.data) {
            return record.data;
        }

        if (view.lookup) {
            if (item.id && view.lookup[item.id]) {
                return view.lookup[item.id];
            }
            var title = item.getAttribute ? item.getAttribute('title') : '';
            if (title && view.lookup[title]) {
                return view.lookup[title];
            }
        }

        return null;
    }
    function safeDecode(value) {
        value = String(value || '');
        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value;
        }
    }
    function normalizePath(value) {
        value = safeDecode(value).replace(/\\/g, '/');
        value = value.replace(/^\/+/, '').replace(/\/+$/, '');
        return value;
    }
    function hasUnsafePathSegments(value, allowRoot) {
        var raw = String(value == null ? '' : value);
        var previous = null;
        var normalized;
        var segments;
        var i;
        var pass;

        // Decode a few times only for validation. The actual path sent to MODX is never rewritten here.
        for (pass = 0; pass < 3 && raw !== previous; pass++) {
            previous = raw;
            raw = safeDecode(raw).replace(/\\/g, '/');

            if (raw.indexOf('\0') !== -1) {
                return true;
            }

            normalized = raw.replace(/^\/+/, '').replace(/\/+$/, '');
            if (!normalized) {
                return !allowRoot;
            }

            segments = normalized.split('/');
            for (i = 0; i < segments.length; i++) {
                if (segments[i] === '.' || segments[i] === '..') {
                    return true;
                }
            }
        }
        return false;
    }
    function parentPath(value) {
        var path = normalizePath(value);
        var pos = path.lastIndexOf('/');
        return pos === -1 ? '' : path.substring(0, pos);
    }
    function getTreeNodePath(node) {
        if (!node || node.isRoot) {
            return '';
        }
        var attrs = node.attributes || {};
        var id = typeof attrs.id !== 'undefined' ? attrs.id : node.id;
        return normalizePath(id);
    }
    function getTreeSource(tree) {
        var source = null;

        if (tree && typeof tree.getSource === 'function') {
            try {
                source = tree.getSource();
                if (source !== null && source !== '') {
                    return source;
                }
            } catch (e) {
                debug('Could not read active Media Source via tree.getSource()', e);
            }
        }
        if (tree && tree.config && tree.config.baseParams && typeof tree.config.baseParams.source !== 'undefined') {
            return tree.config.baseParams.source;
        }
        if (tree && tree.baseParams && typeof tree.baseParams.source !== 'undefined') {
            return tree.baseParams.source;
        }
        return null;
    }
    function getSource(view, tree) {
        var source = getTreeSource(tree);
        if ((source === null || source === '') && view && view.config && typeof view.config.source !== 'undefined') {
            source = view.config.source;
        }
        if ((source === null || source === '') && window.MODx && MODx.config) {
            source = MODx.config.default_media_source;
        }
        return source;
    }
    function sameSource(left, right) {
        return String(left == null ? '' : left) === String(right == null ? '' : right);
    }
    function status(title, message) {
        MODx.msg.status({ title: title, message: message });
    }
    function htmlEncode(value) {
        value = String(value == null ? '' : value);
        return Ext.util.Format.htmlEncode(value);
    }
    function stripTags(value) {
        value = String(value == null ? '' : value);
        return Ext.util.Format.stripTags(value);
    }
    function safeMessage(value) {
        return htmlEncode(stripTags(value));
    }
    function sanitizeFailureResponse(response) {
        var i;

        if (!response) {
            return null;
        }

        // Preserve an originally empty MODX message. MODx.form.Handler.errorJSON()
        // intentionally treats an empty message as "hide the message"; only sanitize text that exists.
        if (typeof response.message !== 'undefined' && response.message !== null && response.message !== '') {
            response.message = safeMessage(response.message);
        }
        if (response.data && typeof response.data.length !== 'undefined') {
            for (i = 0; i < response.data.length; i++) {
                if (!response.data[i]) {
                    continue;
                }
                if (typeof response.data[i].msg !== 'undefined') {
                    response.data[i].msg = safeMessage(response.data[i].msg);
                }
                if (typeof response.data[i].message !== 'undefined') {
                    response.data[i].message = safeMessage(response.data[i].message);
                }
            }
        }
        return response;
    }
    function showFailure(response, coreWillHandle) {
        response = sanitizeFailureResponse(response);

        // MODx.Ajax.request() calls MODx.form.Handler.errorJSON() after our failure callback.
        // Because the response object is sanitized in-place, the core handler receives only safe text.
        if (coreWillHandle && response) {
            return;
        }

        var message = response && response.message ? response.message : _('bettermediabrowser.msg_move_not_possible');

        MODx.msg.alert(_('error'), message);
    }
    function showTimeout() {
        status(_('bettermediabrowser.timeout'), _('bettermediabrowser.msg_timeout'));
    }
    function reloadNode(node) {
        if (!node || !node.reload) {
            return;
        }
        try {
            node.reload();
        } catch (e) {
            debug('Tree node reload failed', e);
        }
    }
    function findTreeNodeByPath(tree, path) {
        if (!tree || !tree.getNodeById) {
            return null;
        }
        var normalized = normalizePath(path);
        var rawCandidates = normalized ? [normalized, normalized + '/', '/' + normalized, '/' + normalized + '/'] : ['/', ''];
        var candidates = [];
        var i;
        var encoded;

        // MODX 3 stores directory node IDs URL-encoded (e.g. images%2Ffolder%2F),
        // while older/browser variants may expose the raw relative path. Support both.
        for (i = 0; i < rawCandidates.length; i++) {
            candidates.push(rawCandidates[i]);
            try {
                encoded = encodeURIComponent(rawCandidates[i]);
                if (encoded !== rawCandidates[i]) {
                    candidates.push(encoded);
                }
            } catch (e) {
                // Keep the raw candidate only.
            }
        }

        for (i = 0; i < candidates.length; i++) {
            var node = tree.getNodeById(candidates[i]);
            if (node) {
                return node;
            }
        }
        return null;
    }
    function refreshView(view) {
        try {
            if (view && typeof view.run === 'function') {
                view.run();
            }
        } catch (e) {
            debug('Browser view refresh failed', e);
        }
    }
    function getRecordPath(record) {
        if (!record) {
            return '';
        }
        if (record.data && record.data.pathRelative) {
            return String(record.data.pathRelative);
        }
        return record.id != null ? String(record.id) : '';
    }
    function getSelectedRecords(view) {
        if (!view || typeof view.getSelectedRecords !== 'function') {
            return [];
        }
        try {
            return view.getSelectedRecords() || [];
        } catch (e) {
            debug('Could not read selected media browser records', e);
            return [];
        }
    }
    function getWctx(view) {
        if (view && view.baseParams && view.baseParams.wctx) {
            return view.baseParams.wctx;
        }
        if (view && view.config && view.config.wctx) {
            return view.config.wctx;
        }
        return (window.MODx && MODx.ctx) ? MODx.ctx : 'web';
    }
    function getAllowedFileTypes(view) {
        if (view && view.baseParams && typeof view.baseParams.allowedFileTypes !== 'undefined') {
            return view.baseParams.allowedFileTypes || '';
        }
        if (view && view.config && typeof view.config.allowedFileTypes !== 'undefined') {
            return view.config.allowedFileTypes || '';
        }
        return '';
    }
    function syncTreeToDirectory(view, directory) {
        var tree = view && view.config ? view.config.tree : null;
        var normalized = normalizePath(directory);
        if (!tree || !normalized) {
            return;
        }

        // Directory IDs in the MODX media tree include a trailing slash. MODX 3's
        // expandTreePath() URL-encodes exactly this value before resolving the node,
        // so omitting the slash makes it fall back to the root instead of selecting
        // the requested directory.
        var treeDirectory = normalized + '/';

        function selectNode(node) {
            if (!node) {
                return false;
            }
            try {
                if (typeof node.ensureVisible === 'function') {
                    node.ensureVisible();
                }
                if (typeof node.select === 'function') {
                    node.select();
                } else if (tree.getSelectionModel) {
                    tree.getSelectionModel().select(node);
                }
                if (tree.cm) {
                    tree.cm.activeNode = node;
                }
                return true;
            } catch (e) {
                debug('Could not select Media Browser tree node', e);
                return false;
            }
        }

        function selectLoadedNode() {
            return selectNode(findTreeNodeByPath(tree, treeDirectory));
        }

        function pollForNode(attempt) {
            if (selectLoadedNode() || attempt >= 24) {
                return;
            }
            window.setTimeout(function () {
                pollForNode(attempt + 1);
            }, 75);
        }

        // Let the DataView finish its buffered selectionchange/showDetails cycle first,
        // then make the folder tree authoritative for the directory selection.
        window.setTimeout(function () {
            try {
                if (selectLoadedNode()) {
                    return;
                }

                // MODX 3 provides this helper and already knows how to expand unloaded
                // path segments. Pass the real directory node ID (including trailing /).
                if (typeof tree.expandTreePath === 'function') {
                    tree.expandTreePath(treeDirectory);
                    pollForNode(0);
                    return;
                }

                // MODX 2 / ExtJS fallback: expand/select by the visible text path and
                // explicitly mark the resolved node as the context-menu active node.
                if (typeof tree.selectPath === 'function' && tree.getRootNode) {
                    var root = tree.getRootNode();
                    var rootPath = root && typeof root.getPath === 'function' ? root.getPath('text') : '';
                    var rootText = root ? stripTags(root.text || '') : '';
                    var textPath = rootPath || (rootText ? '/' + rootText : '');
                    if (textPath) {
                        textPath = textPath.replace(/\/$/, '') + '/' + safeDecode(normalized)
                            .replace(/^\/+|\/+$/g, '');
                        tree.selectPath(textPath, 'text', function (success, node) {
                            if (success && node) {
                                selectNode(node);
                            } else {
                                pollForNode(0);
                            }
                        });
                        return;
                    }
                }

                pollForNode(0);
            } catch (e) {
                debug('Could not synchronize Media Browser tree', e);
            }
        }, 180);
    }

    BetterMediaBrowser.util.closestClass = closestClass;
    BetterMediaBrowser.util.debug = debug;
    BetterMediaBrowser.util.findBrowserView = findBrowserView;
    BetterMediaBrowser.util.findTreeNodeByPath = findTreeNodeByPath;
    BetterMediaBrowser.util.getAllowedFileTypes = getAllowedFileTypes;
    BetterMediaBrowser.util.getRecordData = getRecordData;
    BetterMediaBrowser.util.getRecordPath = getRecordPath;
    BetterMediaBrowser.util.getSelectedRecords = getSelectedRecords;
    BetterMediaBrowser.util.getSource = getSource;
    BetterMediaBrowser.util.getTreeNodePath = getTreeNodePath;
    BetterMediaBrowser.util.getWctx = getWctx;
    BetterMediaBrowser.util.hasClass = hasClass;
    BetterMediaBrowser.util.hasUnsafePathSegments = hasUnsafePathSegments;
    BetterMediaBrowser.util.htmlEncode = htmlEncode;
    BetterMediaBrowser.util.isBrowserItem = isBrowserItem;
    BetterMediaBrowser.util.isBrowserView = isBrowserView;
    BetterMediaBrowser.util.normalizePath = normalizePath;
    BetterMediaBrowser.util.parentPath = parentPath;
    BetterMediaBrowser.util.refreshView = refreshView;
    BetterMediaBrowser.util.reloadNode = reloadNode;
    BetterMediaBrowser.util.safeDecode = safeDecode;
    BetterMediaBrowser.util.sameSource = sameSource;
    BetterMediaBrowser.util.showFailure = showFailure;
    BetterMediaBrowser.util.showTimeout = showTimeout;
    BetterMediaBrowser.util.status = status;
    BetterMediaBrowser.util.stripTags = stripTags;
    BetterMediaBrowser.util.syncTreeToDirectory = syncTreeToDirectory;
})(window, document);
