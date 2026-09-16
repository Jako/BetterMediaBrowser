(function (window, document) {
    'use strict';

    var api = window.BetterMediaBrowser || {};

    if (api.initialized) {
        return;
    }

    var state = {
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

    api.initialized = true;

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

    function failSafe(context, error) {
        debug(context, error);
        clearDrag();
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

    function isDirectoryNode(node) {
        if (!node) {
            return false;
        }
        if (node.isRoot) {
            return true;
        }
        var attrs = node.attributes || {};
        if (attrs.disabled || node.disabled) {
            return false;
        }
        if (attrs.type && String(attrs.type).toLowerCase() !== 'dir') {
            return false;
        }
        return !(attrs.leaf === true || node.leaf === true);

    }

    function isMovableFile(data) {
        if (!data || !data.pathRelative || data.disabled) {
            return false;
        }
        if (hasUnsafePathSegments(data.pathRelative, false)) {
            return false;
        }

        var type = String(data.type || data.kind || '').toLowerCase();
        if (type === 'dir' || type === 'directory' || type === 'folder') {
            return false;
        }
        return !(data.is_dir === true || data.isdir === true || data.directory === true);

    }

    function hasMovePermission() {
        // Check for directory_update permission in MODx.perm
        if (typeof MODx.perm.directory_update !== 'undefined') {
            return !!MODx.perm.directory_update;
        }
        // Otherwise check the permission on server side in the processor
        return true;
    }

    function findNodeByDom(tree, row) {
        if (!tree || !row) {
            return null;
        }

        var id = row.getAttribute('ext:tree-node-id') ||
            row.getAttribute('data-nodeid') ||
            row.getAttribute('data-node-id');

        if (id && tree.getNodeById) {
            var direct = tree.getNodeById(id);
            if (!direct) {
                direct = tree.getNodeById(safeDecode(id));
            }
            if (direct) {
                return direct;
            }
        }

        var root = tree.getRootNode ? tree.getRootNode() : null;
        var found = null;
        if (root && root.cascade) {
            root.cascade(function (node) {
                if (found || !node.ui) {
                    return;
                }
                var nodeEl = node.ui.elNode || (node.ui.getEl ? node.ui.getEl() : null);
                if (nodeEl && (nodeEl === row || (nodeEl.contains && nodeEl.contains(row)))) {
                    found = node;
                }
            });
        }
        return found;
    }

    function findDropTarget(domTarget, tree) {
        if (!tree || !tree.getEl || !tree.getEl()) {
            return null;
        }

        var treeDom = tree.getEl().dom;
        var target = domTarget && domTarget.nodeType === 3 ? domTarget.parentNode : domTarget;
        if (!target || !treeDom || !(treeDom === target || (treeDom.contains && treeDom.contains(target)))) {
            return null;
        }

        var row = closestClass(target, 'x-tree-node-el', treeDom);
        if (!row) {
            return null;
        }

        var node = findNodeByDom(tree, row);
        if (!isDirectoryNode(node)) {
            return null;
        }

        return {node: node, row: row};
    }

    function clearExpandTimer() {
        if (state.expandTimer) {
            window.clearTimeout(state.expandTimer);
            state.expandTimer = null;
        }
    }

    function clearTarget() {
        clearExpandTimer();
        if (state.target && state.target.row) {
            try {
                if (window.Ext && Ext.get) {
                    Ext.get(state.target.row).removeClass('bettermediabrowser-drop-target');
                } else {
                    state.target.row.className = String(state.target.row.className || '').replace(/\bbettermediabrowser-drop-target\b/g, '');
                }
            } catch (e) {
                debug('Could not clear target styling', e);
            }
        }
        state.target = null;
    }

    function setTarget(target) {
        if (state.target && target && state.target.node === target.node) {
            return;
        }

        clearTarget();
        state.target = target;

        if (!target || !target.row) {
            return;
        }

        try {
            if (window.Ext && Ext.get) {
                Ext.get(target.row).addClass('bettermediabrowser-drop-target');
            } else {
                target.row.className += ' bettermediabrowser-drop-target';
            }
        } catch (e) {
            debug('Could not apply target styling', e);
        }

        if (target.node && !target.node.expanded && target.node.expand) {
            state.expandTimer = window.setTimeout(function () {
                try {
                    if (state.target && state.target.node === target.node) {
                        target.node.expand(false, false);
                    }
                } catch (e) {
                    debug('Could not auto-expand target folder', e);
                }
            }, 700);
        }
    }

    function clearDrag() {
        clearTarget();
        if (state.drag && state.drag.item) {
            try {
                var dragItems = state.drag.items && state.drag.items.length ? state.drag.items : [state.drag.item];
                for (var dragIndex = 0; dragIndex < dragItems.length; dragIndex++) {
                    if (window.Ext && Ext.get) {
                        Ext.get(dragItems[dragIndex]).removeClass('bettermediabrowser-drag-source');
                    } else {
                        dragItems[dragIndex].className = String(dragItems[dragIndex].className || '').replace(/\bbettermediabrowser-drag-source\b/g, '');
                    }
                }
            } catch (e) {
                debug('Could not clear drag source styling', e);
            }
        }
        state.drag = null;
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
        MODx.msg.status({title: title, message: message});
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

    function getDragFiles(view, draggedData) {
        var selected = getSelectedRecords(view);
        var draggedPath = normalizePath(draggedData && draggedData.pathRelative);
        var files = [];
        var seen = {};
        var draggedIsSelected = false;
        var i;

        if (!draggedPath || selected.length < 2) {
            return [draggedData];
        }

        for (i = 0; i < selected.length; i++) {
            var data = selected[i] && selected[i].data ? selected[i].data : null;
            if (!isMovableFile(data)) {
                continue;
            }

            var path = normalizePath(data.pathRelative);
            if (!path) {
                continue;
            }
            if (path === draggedPath) {
                draggedIsSelected = true;
            }
            if (!seen[path]) {
                seen[path] = true;
                files.push(data);
            }
        }

        // Only turn a drag into a batch move when the item the user actually grabbed is
        // part of the current multi-selection. Dragging a different file keeps the native
        // single-file behaviour and does not unexpectedly move the previous selection.
        return draggedIsSelected && files.length > 1 ? files : [draggedData];
    }

    function getDragItems(view, item, files) {
        if (!view || !files || files.length < 2 || typeof view.getSelectedNodes !== 'function') {
            return [item];
        }
        try {
            var nodes = view.getSelectedNodes() || [];
            return nodes.length > 1 ? nodes : [item];
        } catch (e) {
            debug('Could not read selected drag nodes', e);
            return [item];
        }
    }

    function moveFile(drag, target) {
        if (state.disabled || state.busy || !drag || !target) {
            return;
        }

        var targetPath = getTreeNodePath(target.node);
        var targetId = target.node.isRoot
            ? '/'
            : ((target.node.attributes && typeof target.node.attributes.id !== 'undefined') ? target.node.attributes.id : target.node.id);

        if (hasUnsafePathSegments(targetId, true)) {
            status(_('bettermediabrowser.not_allowed'), _('bettermediabrowser.msg_target_not_allowed'));
            return;
        }

        var currentSource = getSource(drag.view, drag.tree);
        if (!sameSource(drag.source, currentSource)) {
            status(_('bettermediabrowser.not_allowed'), _('bettermediabrowser.msg_move_not_allowed'));
            return;
        }

        var candidates = drag.files && drag.files.length ? drag.files : [drag.data];
        var files = [];
        var sourceNodes = [];
        var sourceNodeIds = {};
        var i;

        for (i = 0; i < candidates.length; i++) {
            var data = candidates[i];
            if (!isMovableFile(data)) {
                continue;
            }

            var from = data.pathRelative;
            if (hasUnsafePathSegments(from, false)) {
                status(_('bettermediabrowser.not_allowed'), _('bettermediabrowser.msg_target_not_allowed'));
                return;
            }

            // A multi-selection comes from one browser directory in normal MODX use, but
            // keep this per-file check so the batch remains safe if that ever changes.
            if (parentPath(from) === targetPath) {
                continue;
            }

            files.push(data);

            var sourceNode = findTreeNodeByPath(drag.tree, parentPath(from));
            if (sourceNode) {
                var sourceNodeKey = String(sourceNode.id || parentPath(from));
                if (!sourceNodeIds[sourceNodeKey]) {
                    sourceNodeIds[sourceNodeKey] = true;
                    sourceNodes.push(sourceNode);
                }
            }
        }

        if (!files.length) {
            status(_('bettermediabrowser.attention'), _('bettermediabrowser.msg_file_exists'));
            return;
        }

        var targetNode = target.node;
        var folderName = targetNode.isRoot ? ((targetNode.text && stripTags(targetNode.text)) || '/') : stripTags(targetNode.text || targetPath || '/');
        var action = BetterMediaBrowser.config.modxversion >= '3' ? 'Browser/Directory/Sort' : 'browser/directory/sort';
        var total = files.length;
        var moved = 0;
        var index = 0;
        var requestToken = {};
        var busyGuard;

        function clearBusyGuard() {
            if (busyGuard) {
                window.clearTimeout(busyGuard);
                if (state.requestTimer === busyGuard) {
                    state.requestTimer = null;
                }
                busyGuard = null;
            }
        }

        function releaseBusy() {
            if (state.requestToken !== requestToken) {
                return false;
            }
            clearBusyGuard();
            state.requestToken = null;
            state.busy = false;
            return true;
        }

        function armBusyGuard() {
            clearBusyGuard();
            busyGuard = window.setTimeout(function () {
                if (!releaseBusy()) {
                    return;
                }
                debug('Move request timed out; lock released');
                refreshView(drag.view);
                showTimeout();
            }, 30000);
            state.requestTimer = busyGuard;
        }

        function refreshMoveResult() {
            refreshView(drag.view);
            for (var nodeIndex = 0; nodeIndex < sourceNodes.length; nodeIndex++) {
                if (sourceNodes[nodeIndex] !== targetNode) {
                    reloadNode(sourceNodes[nodeIndex]);
                }
            }
            reloadNode(targetNode);
        }

        function finishMove() {
            if (!releaseBusy()) {
                return;
            }
            refreshMoveResult();

            if (total > 1) {
                status(_('success'), _('bettermediabrowser.msg_files_moved', {
                    count: total,
                    folder: htmlEncode(folderName)
                }));
            } else {
                var fileName = files[0].name || files[0].pathRelative.substring(files[0].pathRelative.lastIndexOf('/') + 1);
                status(_('success'), _('bettermediabrowser.msg_file_moved', {
                    file: htmlEncode(fileName),
                    folder: htmlEncode(folderName)
                }));
            }
        }

        function failMove(response, coreWillHandle) {
            if (!releaseBusy()) {
                return;
            }
            refreshMoveResult();
            if (moved > 0 && total > 1) {
                status(_('bettermediabrowser.attention'), _('bettermediabrowser.msg_files_move_partial', {
                    count: moved,
                    total: total
                }));
            }
            showFailure(response, coreWillHandle);
        }

        function moveNext() {
            if (index >= total) {
                finishMove();
                return;
            }

            var data = files[index++];
            var params = {
                action: action,
                source: drag.source,
                from: data.pathRelative,
                to: targetId,
                point: 'append'
            };

            if (BetterMediaBrowser.config.modxversion >= '3') {
                params.destSource = drag.source;
            }

            armBusyGuard();
            try {
                MODx.Ajax.request({
                    url: MODx.config.connector_url,
                    params: params,
                    listeners: {
                        success: {
                            fn: function () {
                                moved++;
                                moveNext();
                            }
                        },
                        failure: {
                            fn: function (response) {
                                failMove(response, true);
                            }
                        }
                    }
                });
            } catch (e) {
                debug('Ajax move request failed before it could be sent', e);
                failMove(null, false);
            }
        }

        state.busy = true;
        state.requestToken = requestToken;
        moveNext();
    }

    function onDragStart(event, item, view) {
        if (state.disabled || state.busy || !hasMovePermission()) {
            return;
        }

        var tree = view && view.config ? view.config.tree : null;
        if (!tree) {
            return;
        }

        var data = getRecordData(view, item);
        if (!isMovableFile(data)) {
            return;
        }

        var source = getSource(view, tree);
        if (source === null || source === '') {
            debug('No Media Source could be resolved for the dragged item');
            return;
        }

        var files = getDragFiles(view, data);
        var dragItems = getDragItems(view, item, files);

        state.drag = {
            item: item,
            items: dragItems,
            view: view,
            tree: tree,
            data: data,
            files: files,
            source: source
        };

        try {
            if (window.Ext && Ext.get) {
                for (var dragIndex = 0; dragIndex < dragItems.length; dragIndex++) {
                    Ext.get(dragItems[dragIndex]).addClass('bettermediabrowser-drag-source');
                }
            }
        } catch (e) {
            debug('Could not style drag source', e);
        }

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            try {
                event.dataTransfer.setData('text/plain', String(data.pathRelative));
                event.dataTransfer.setData('application/x-bettermediabrowser', '1');
                event.dataTransfer.setData('application/x-bettermediabrowser-count', String(files.length));
            } catch (e) {
                debug('Could not set drag data', e);
            }
            try {
                if (event.dataTransfer.setDragImage) {
                    event.dataTransfer.setDragImage(item, 20, 20);
                }
            } catch (e) {
                debug('Could not set drag image', e);
            }
        }
    }

    function onTreeDragOver(event, tree) {
        if (state.disabled || !state.drag || state.busy || state.drag.tree !== tree) {
            return;
        }

        var currentSource = getSource(state.drag.view, tree);
        if (!sameSource(state.drag.source, currentSource)) {
            clearTarget();
            return;
        }

        var target = findDropTarget(event.target, tree);
        if (!target) {
            clearTarget();
            return;
        }

        var targetId = target.node.isRoot
            ? '/'
            : ((target.node.attributes && typeof target.node.attributes.id !== 'undefined') ? target.node.attributes.id : target.node.id);
        if (hasUnsafePathSegments(targetId, true)) {
            clearTarget();
            return;
        }

        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
        setTarget(target);
    }

    function onTreeDrop(event, tree) {
        if (state.disabled || !state.drag || state.busy || state.drag.tree !== tree) {
            return;
        }

        var target = findDropTarget(event.target, tree);
        if (!target) {
            clearDrag();
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        var drag = state.drag;
        clearDrag();
        moveFile(drag, target);
    }

    function unbindTree(tree) {
        if (!tree || !tree.BetterMediaBrowserHandlers) {
            return;
        }

        var handlers = tree.BetterMediaBrowserHandlers;
        var dom = handlers.dom;
        try {
            if (dom && dom.removeEventListener) {
                dom.removeEventListener('dragover', handlers.dragover, false);
                dom.removeEventListener('drop', handlers.drop, false);
                dom.removeEventListener('dragleave', handlers.dragleave, false);
            }
            if (handlers.destroy && typeof tree.un === 'function') {
                tree.un('destroy', handlers.destroy, tree);
            }
        } catch (e) {
            debug('Could not unbind media tree', e);
        }

        try {
            delete tree.BetterMediaBrowserHandlers;
        } catch (e) {
            tree.BetterMediaBrowserHandlers = null;
        }
    }

    function bindTree(tree) {
        if (state.disabled || !tree || !tree.getEl || !tree.getEl()) {
            return false;
        }

        if (tree.BetterMediaBrowserHandlers) {
            return true;
        }

        var treeDom = tree.getEl().dom;
        if (!treeDom || !treeDom.addEventListener) {
            return false;
        }

        var handlers = {};
        handlers.dom = treeDom;
        handlers.dragover = function (event) {
            try {
                onTreeDragOver(event, tree);
            } catch (e) {
                failSafe('Tree dragover handler failed', e);
            }
        };
        handlers.drop = function (event) {
            try {
                onTreeDrop(event, tree);
            } catch (e) {
                failSafe('Tree drop handler failed', e);
            }
        };
        handlers.dragleave = function (event) {
            try {
                if (state.disabled || !state.drag || state.drag.tree !== tree) {
                    return;
                }
                var related = event.relatedTarget;
                if (!related || !(treeDom === related || (treeDom.contains && treeDom.contains(related)))) {
                    clearTarget();
                }
            } catch (e) {
                failSafe('Tree dragleave handler failed', e);
            }
        };
        handlers.destroy = function () {
            if (state.drag && state.drag.tree === tree) {
                clearDrag();
            }
            unbindTree(tree);
        };

        treeDom.addEventListener('dragover', handlers.dragover, false);
        treeDom.addEventListener('drop', handlers.drop, false);
        treeDom.addEventListener('dragleave', handlers.dragleave, false);
        tree.BetterMediaBrowserHandlers = handlers;

        if (typeof tree.on === 'function') {
            tree.on('destroy', handlers.destroy, tree);
        }

        return true;
    }

    function unbindAllTrees() {
        Ext.ComponentMgr.all.each(function (cmp) {
            if (cmp && cmp.BetterMediaBrowserHandlers) {
                unbindTree(cmp);
            }
        });
    }

    function unmarkItem(item) {
        if (!item) {
            return;
        }

        var handlers = item.BetterMediaBrowserHandlers;
        try {
            if (handlers && item.removeEventListener) {
                item.removeEventListener('dragstart', handlers.dragstart, false);
                item.removeEventListener('dragend', handlers.dragend, false);
            }
        } catch (e) {
            debug('Could not unbind draggable item', e);
        }

        try {
            item.removeAttribute('data-bettermediabrowser');
            item.removeAttribute('draggable');
            if (window.Ext && Ext.get) {
                Ext.get(item).removeClass('bettermediabrowser-draggable');
                Ext.get(item).removeClass('bettermediabrowser-drag-source');
            } else {
                item.className = String(item.className || '')
                    .replace(/\bbettermediabrowser-draggable\b/g, '')
                    .replace(/\bbettermediabrowser-drag-source\b/g, '');
            }
        } catch (e) {
            debug('Could not reset draggable item', e);
        }

        var images = item.querySelectorAll ? item.querySelectorAll('img[data-bettermediabrowser-image="1"]') : [];
        var i;
        for (i = 0; i < images.length; i++) {
            images[i].removeAttribute('draggable');
            images[i].removeAttribute('data-bettermediabrowser-image');
        }

        try {
            delete item.BetterMediaBrowserHandlers;
        } catch (e) {
            item.BetterMediaBrowserHandlers = null;
        }
    }

    function markItem(item) {
        if (state.disabled || !BetterMediaBrowser.config.drag_drop_enabled || !item || item.getAttribute('data-bettermediabrowser') === '1' || !hasMovePermission()) {
            return;
        }

        var view = findBrowserView(item);
        if (!view || !view.config || !view.config.tree || !bindTree(view.config.tree)) {
            return;
        }

        var handlers = {};
        handlers.dragstart = function (event) {
            try {
                onDragStart(event, item, view);
            } catch (e) {
                failSafe('Item dragstart handler failed', e);
            }
        };
        handlers.dragend = function () {
            try {
                clearDrag();
            } catch (e) {
                failSafe('Item dragend handler failed', e);
            }
        };

        item.BetterMediaBrowserHandlers = handlers;
        item.setAttribute('data-bettermediabrowser', '1');
        item.setAttribute('draggable', 'true');
        try {
            if (window.Ext && Ext.get) {
                Ext.get(item).addClass('bettermediabrowser-draggable');
            } else {
                item.className += ' bettermediabrowser-draggable';
            }
        } catch (e) {
            debug('Could not style draggable item', e);
        }

        var images = item.getElementsByTagName ? item.getElementsByTagName('img') : [];
        var i;
        for (i = 0; i < images.length; i++) {
            images[i].setAttribute('draggable', 'false');
            images[i].setAttribute('data-bettermediabrowser-image', '1');
        }

        item.addEventListener('dragstart', handlers.dragstart, false);
        item.addEventListener('dragend', handlers.dragend, false);
    }

    function unmarkAllItems() {
        if (!document.querySelectorAll) {
            return;
        }
        var items = document.querySelectorAll('[data-bettermediabrowser="1"]');
        var i;
        for (i = 0; i < items.length; i++) {
            unmarkItem(items[i]);
        }
    }

    function scan(root) {
        root = root || document;
        if (state.disabled) {
            return;
        }
        bindSearchButtons();
        bindBrowserEnhancements();
        if (!hasMovePermission()) {
            return;
        }
        if (root.nodeType === 1 && isBrowserItem(root)) {
            markItem(root);
        }
        if (!root.querySelectorAll) {
            return;
        }

        var items = root.querySelectorAll('.modx-browser-thumb-wrap, .modx-browser-list-item');
        var i;
        for (i = 0; i < items.length; i++) {
            markItem(items[i]);
        }
    }

    function queueScan(root, delay) {
        var now;

        if (state.disabled) {
            return;
        }

        root = root || document;
        if (state.pendingRoots.indexOf) {
            if (state.pendingRoots.indexOf(root) === -1) {
                state.pendingRoots.push(root);
            }
        } else {
            state.pendingRoots.push(root);
        }

        now = new Date().getTime();
        if (!state.pendingSince) {
            state.pendingSince = now;
        }

        // Do not let continuous lazy-loading postpone the scan indefinitely.
        // After 300 ms of queued work, force the next scan onto the event loop immediately.
        if (now - state.pendingSince >= 300) {
            delay = 0;
        }

        if (state.scanTimer) {
            window.clearTimeout(state.scanTimer);
        }
        state.scanTimer = window.setTimeout(function () {
            var roots = state.pendingRoots.slice(0);
            var i;
            state.pendingRoots = [];
            state.pendingSince = null;
            state.scanTimer = null;
            for (i = 0; i < roots.length; i++) {
                try {
                    scan(roots[i]);
                } catch (e) {
                    debug('Browser scan failed', e);
                }
            }
        }, typeof delay === 'number' ? delay : 100);
    }

    function hasFileRemovePermission() {
        if (!window.MODx) {
            return false;
        }
        if (MODx.perm && typeof MODx.perm.file_remove !== 'undefined') {
            return !!MODx.perm.file_remove;
        }
        return true;
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

    function activeNodeIsSelected(view, records) {
        if (!view || !view.cm || !view.cm.activeNode || !records || !records.length) {
            return false;
        }

        var activeNode = view.cm.activeNode;
        var activeData = null;
        if (view.lookup) {
            activeData = (activeNode.id && view.lookup[activeNode.id]) ||
                (activeNode.getAttribute && activeNode.getAttribute('title') && view.lookup[activeNode.getAttribute('title')]) || null;
        }
        var activePath = activeData && activeData.pathRelative ? normalizePath(activeData.pathRelative) : '';
        var i;

        if (!activePath) {
            return false;
        }

        for (i = 0; i < records.length; i++) {
            if (normalizePath(getRecordPath(records[i])) === activePath) {
                return true;
            }
        }
        return false;
    }

    function refreshAfterBatchDelete(view) {
        try {
            if (view && view.config && view.config.tree) {
                if (view.config.tree.cm && view.config.tree.cm.activeNode &&
                    view.config.tree.cm.activeNode.id && String(view.config.tree.cm.activeNode.id).match(/.*?\/$/)) {
                    if (typeof view.config.tree.refreshParentNode === 'function') {
                        view.config.tree.refreshParentNode();
                    } else if (typeof view.config.tree.refresh === 'function') {
                        view.config.tree.refresh();
                    }
                } else if (typeof view.config.tree.refresh === 'function') {
                    view.config.tree.refresh();
                }
            }
            refreshView(view);
        } catch (e) {
            debug('Could not refresh Media Browser after batch delete', e);
        }
    }

    function removeSelectedFiles(view, records) {
        if (!hasFileRemovePermission() || !view || !records || records.length < 2) {
            return false;
        }

        var files = [];
        var i;
        for (i = 0; i < records.length; i++) {
            var path = getRecordPath(records[i]);
            if (path && !hasUnsafePathSegments(path, false)) {
                files.push(path);
            }
        }
        if (files.length < 2) {
            return false;
        }

        var tree = view.config ? view.config.tree : null;
        var source = getSource(view, tree);
        if (source === null || source === '') {
            return false;
        }
        var wctx = getWctx(view);
        var action = BetterMediaBrowser.config.modxversion >= '3' ? 'Browser/File/Remove' : 'browser/file/remove';
        var total = files.length;

        Ext.Msg.confirm(
            _('warning'),
            _('bettermediabrowser.remove_selected_confirm', {count: total}),
            function (button) {
                if (button !== 'yes') {
                    return;
                }

                var index = 0;
                var removeNext = function () {
                    if (index >= files.length) {
                        refreshAfterBatchDelete(view);
                        status(_('success'), _('bettermediabrowser.msg_files_removed', {count: total}));
                        return;
                    }

                    var file = files[index++];
                    try {
                        MODx.Ajax.request({
                            url: MODx.config.connector_url,
                            params: {
                                action: action,
                                file: file,
                                source: source,
                                wctx: wctx
                            },
                            listeners: {
                                success: {
                                    fn: removeNext
                                },
                                failure: {
                                    fn: function (response) {
                                        showFailure(response, true);
                                        refreshAfterBatchDelete(view);
                                    }
                                }
                            }
                        });
                    } catch (e) {
                        debug('Batch delete request failed before it could be sent', e);
                        refreshAfterBatchDelete(view);
                        showFailure(null, false);
                    }
                };

                removeNext();
            }
        );
        return true;
    }

    function menuContainsHandler(menu, handlerName) {
        if (!menu || !menu.length) {
            return false;
        }

        var expected = String(handlerName || '').toLowerCase();
        for (var i = 0; i < menu.length; i++) {
            var item = menu[i];
            if (!item || item === '-') {
                continue;
            }
            if (Object.prototype.toString.call(item) === '[object Array]') {
                if (menuContainsHandler(item, handlerName)) {
                    return true;
                }
                continue;
            }
            if (typeof item.handler !== 'undefined' && item.handler !== null &&
                String(item.handler).toLowerCase().indexOf(expected) !== -1) {
                return true;
            }
            if (item.menu && item.menu.items && menuContainsHandler(item.menu.items, handlerName)) {
                return true;
            }
        }
        return false;
    }

    function triggerHiddenDownload(url) {
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.src = url;
        document.body.appendChild(iframe);
        window.setTimeout(function () {
            try {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            } catch (e) {
                debug('Could not clean up download iframe', e);
            }
        }, 60000);
    }

    function downloadSelectedFiles(view, records) {
        if (!view || !records || records.length < 2) {
            return false;
        }

        var files = [];
        for (var i = 0; i < records.length; i++) {
            var path = getRecordPath(records[i]);
            if (path && !hasUnsafePathSegments(path, false)) {
                files.push(path);
            }
        }
        if (files.length < 2) {
            return false;
        }

        var tree = view.config ? view.config.tree : null;
        var source = getSource(view, tree);
        if (source === null || source === '') {
            return false;
        }
        var wctx = getWctx(view);
        var isModx3 = BetterMediaBrowser.config.modxversion >= '3';
        var action = isModx3 ? 'Browser/File/Download' : 'browser/file/download';
        var total = files.length;
        var started = 0;
        var index = 0;

        var downloadNext = function () {
            if (index >= files.length) {
                status('', _('bettermediabrowser.msg_files_download_started', {count: started}));
                return;
            }

            var file = files[index++];
            try {
                MODx.Ajax.request({
                    url: MODx.config.connector_url,
                    params: {
                        action: action,
                        file: file,
                        source: source,
                        wctx: wctx
                    },
                    listeners: {
                        success: {
                            fn: function (response) {
                                var downloadFile = file;
                                if (isModx3) {
                                    downloadFile = response && response.object && response.object.url ? response.object.url : '';
                                }
                                if (!downloadFile) {
                                    MODx.msg.alert(_('error'), _('bettermediabrowser.msg_download_not_possible'));
                                    if (started > 0) {
                                        status(_('warning'), _('bettermediabrowser.msg_files_download_partial', {
                                            count: started,
                                            total: total
                                        }));
                                    }
                                    return;
                                }

                                var params = {
                                    action: action,
                                    download: 1,
                                    file: downloadFile,
                                    HTTP_MODAUTH: MODx.siteId,
                                    source: source,
                                    wctx: wctx
                                };
                                var separator = MODx.config.connector_url.indexOf('?') === -1 ? '?' : '&';
                                triggerHiddenDownload(MODx.config.connector_url + separator + Ext.urlEncode(params));
                                started++;

                                // Keep requests sequential and give the browser a short moment to start
                                // each attachment before the next one is requested.
                                window.setTimeout(downloadNext, 150);
                            }
                        },
                        failure: {
                            fn: function (response) {
                                showFailure(response, true);
                                if (started > 0) {
                                    status(_('warning'), _('bettermediabrowser.msg_files_download_partial', {
                                        count: started,
                                        total: total
                                    }));
                                }
                            }
                        }
                    }
                });
            } catch (e) {
                debug('Batch download request failed before it could be sent', e);
                MODx.msg.alert(_('error'), _('bettermediabrowser.msg_download_not_possible'));
                if (started > 0) {
                    status(_('warning'), _('bettermediabrowser.msg_files_download_partial', {
                        count: started,
                        total: total
                    }));
                }
            }
        };

        downloadNext();
        return true;
    }

    function getStateProvider() {
        try {
            if (!window.Ext || !Ext.state || !Ext.state.Manager) {
                return null;
            }

            // Prefer the provider already configured by MODX. This keeps BetterMediaBrowser
            // on the same state backend as the rest of the Manager instead of maintaining
            // a separate browser-tab-only sessionStorage value.
            if (typeof Ext.state.Manager.getProvider === 'function') {
                var provider = Ext.state.Manager.getProvider();
                if (provider && typeof provider.get === 'function' &&
                    typeof provider.set === 'function' && typeof provider.clear === 'function') {
                    return provider;
                }
            }

            // Older/custom ExtJS setups may expose the state methods directly on Manager.
            if (typeof Ext.state.Manager.get === 'function' &&
                typeof Ext.state.Manager.set === 'function' && typeof Ext.state.Manager.clear === 'function') {
                return Ext.state.Manager;
            }
        } catch (e) {
            debug('Ext.state.Provider is not available', e);
        }
        return null;
    }

    function lastFolderStorageKey(view, source) {
        return 'bettermediabrowser.lastFolder.' + encodeURIComponent(getWctx(view)) + '.' + encodeURIComponent(String(source == null ? '' : source));
    }

    function rememberLastFolder(view, source, directory) {
        var provider = getStateProvider();
        if (!provider || source === null || source === '') {
            return;
        }

        var key = lastFolderStorageKey(view, source);
        var normalized = normalizePath(directory);
        try {
            if (!normalized) {
                provider.clear(key);
                return;
            }
            if (!hasUnsafePathSegments(normalized, true)) {
                provider.set(key, normalized);
            }
        } catch (e) {
            debug('Could not remember Media Browser folder via Ext.state.Provider', e);
        }
    }

    function readLastFolder(view, source) {
        var provider = getStateProvider();
        if (!provider || source === null || source === '') {
            return '';
        }
        try {
            var value = provider.get(lastFolderStorageKey(view, source), '') || '';
            if (!value || typeof value !== 'string' || hasUnsafePathSegments(value, true)) {
                return '';
            }
            return normalizePath(value);
        } catch (e) {
            debug('Could not read remembered Media Browser folder from Ext.state.Provider', e);
            return '';
        }
    }

    function hasExplicitOpenTo(view) {
        if (!view || !view.config || typeof view.config.openTo === 'undefined' || view.config.openTo === null) {
            return false;
        }
        return String(view.config.openTo) !== '';
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
                        textPath = textPath.replace(/\/$/, '') + '/' + safeDecode(normalized).replace(/^\/+|\/+$/g, '');
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

    function isRightMouseButton(event) {
        if (!event) {
            return false;
        }
        if (typeof event.button === 'number') {
            return event.button === 2;
        }
        return event.which === 3;
    }

    function getEventItemNode(view, event) {
        if (!view || !event || typeof view.findItemFromChild !== 'function') {
            return null;
        }
        try {
            var target = event.target || event.srcElement;
            return target ? view.findItemFromChild(target) : null;
        } catch (e) {
            debug('Could not resolve Media Browser item for context menu', e);
            return null;
        }
    }

    function getEventItemIndex(view, event) {
        if (!view || typeof view.indexOf !== 'function') {
            return -1;
        }
        var item = getEventItemNode(view, event);
        return item ? view.indexOf(item) : -1;
    }

    function getEventPageXY(event) {
        var doc = document.documentElement || {};
        var body = document.body || {};
        return [
            typeof event.pageX === 'number' ? event.pageX : (event.clientX || 0) + (doc.scrollLeft || body.scrollLeft || 0),
            typeof event.pageY === 'number' ? event.pageY : (event.clientY || 0) + (doc.scrollTop || body.scrollTop || 0)
        ];
    }

    function showMultiSelectionContextMenu(view, binding, event) {
        var records = binding.contextSelectionRecords;
        if (!records || records.length < 2 || !view.cm) {
            return false;
        }

        var item = getEventItemNode(view, event);
        if (!item) {
            return false;
        }
        var data = view.lookup ? view.lookup[item.id] : null;
        var nativeMenu = data && data.menu ? data.menu : [];
        var canDownload = menuContainsHandler(nativeMenu, 'downloadFile');
        var canRemove = menuContainsHandler(nativeMenu, 'removeFile');
        var menu = view.cm;
        var snapshot = records.slice(0);

        menu.removeAll();
        if (canDownload) {
            menu.add({
                text: _('bettermediabrowser.download_selected'),
                scope: view,
                handler: function () {
                    binding.contextSelectionRecords = null;
                    binding.contextSelectionIndexes = null;
                    downloadSelectedFiles(view, snapshot);
                }
            });
        }
        if (canRemove) {
            menu.add({
                text: _('bettermediabrowser.delete_selected'),
                scope: view,
                handler: function () {
                    binding.contextSelectionRecords = null;
                    binding.contextSelectionIndexes = null;
                    removeSelectedFiles(view, snapshot);
                }
            });
        }

        menu.activeNode = item;
        if (menu.items && menu.items.getCount && menu.items.getCount() > 0) {
            menu.showAt(getEventPageXY(event));
        }
        return true;
    }

    function getSelectedIndexes(view) {
        if (!view) {
            return [];
        }
        try {
            if (typeof view.getSelectedIndexes === 'function') {
                return view.getSelectedIndexes() || [];
            }

            var records = getSelectedRecords(view);
            var indexes = [];
            if (!view.store || typeof view.store.indexOf !== 'function') {
                return indexes;
            }
            for (var i = 0; i < records.length; i++) {
                var index = view.store.indexOf(records[i]);
                if (index >= 0) {
                    indexes.push(index);
                }
            }
            return indexes;
        } catch (e) {
            debug('Could not read selected Media Browser indexes', e);
            return [];
        }
    }

    function restoreSelectedIndexes(view, indexes) {
        if (!view || !indexes || indexes.length < 2 || typeof view.select !== 'function') {
            return;
        }

        try {
            // Restore one item at a time. This is compatible with ExtJS 3 and avoids
            // relying on array support in DataView.select().
            for (var i = 0; i < indexes.length; i++) {
                view.select(indexes[i], i > 0, true);
            }
        } catch (e) {
            debug('Could not restore Media Browser multi-selection', e);
        }
    }

    function attachContextSelectionPreserver(view, binding) {
        if (!view || !binding || binding.contextDomEl || !view.rendered || typeof view.getEl !== 'function') {
            return;
        }

        var extEl = view.getEl();
        var dom = extEl && extEl.dom ? extEl.dom : null;
        if (!dom || typeof dom.addEventListener !== 'function') {
            return;
        }

        binding.contextMouseDownCapture = function (event) {
            // Any new click starts a new context-menu interaction. Keep the snapshot only
            // for a right-click on an item that is already part of the current selection.
            binding.contextSelectionIndexes = null;
            binding.contextSelectionRecords = null;

            if (!isRightMouseButton(event)) {
                return;
            }

            var selectedIndexes = getSelectedIndexes(view);
            var selectedRecords = getSelectedRecords(view);
            if (selectedIndexes.length < 2 || selectedRecords.length < 2) {
                return;
            }

            var clickedIndex = getEventItemIndex(view, event);
            if (clickedIndex < 0 || selectedIndexes.indexOf(clickedIndex) === -1) {
                return;
            }

            // ExtJS 3 changes the live DataView selection while opening the native MODX
            // context menu. Store both records and indexes before that happens. The record
            // snapshot is also used by removeFile(), so batch deletion does not depend on
            // ExtJS still reporting the original selection afterwards.
            binding.contextSelectionIndexes = selectedIndexes.slice(0);
            binding.contextSelectionRecords = selectedRecords.slice(0);
        };

        binding.contextMenuCapture = function (event) {
            var selectedIndexes = binding.contextSelectionIndexes;
            if (!selectedIndexes || selectedIndexes.length < 2) {
                return;
            }

            var clickedIndex = getEventItemIndex(view, event);
            if (clickedIndex < 0 || selectedIndexes.indexOf(clickedIndex) === -1) {
                binding.contextSelectionIndexes = null;
                binding.contextSelectionRecords = null;
                return;
            }

            // Intercept the native MODX/ExtJS context menu before it collapses the current
            // multi-selection to the right-clicked file. For a multi-selection we expose
            // only actions that make sense for several files: download and delete.
            if (event.preventDefault) {
                event.preventDefault();
            }
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            }

            restoreSelectedIndexes(view, selectedIndexes);
            showMultiSelectionContextMenu(view, binding, event);
        };

        dom.addEventListener('mousedown', binding.contextMouseDownCapture, true);
        dom.addEventListener('contextmenu', binding.contextMenuCapture, true);
        binding.contextDomEl = dom;
    }

    function unbindBrowserEnhancement(view) {
        if (!view || !view.BetterMediaBrowserEnhancement) {
            return;
        }
        var binding = view.BetterMediaBrowserEnhancement;
        try {
            if (binding.removeFileWrapper && view.removeFile === binding.removeFileWrapper) {
                view.removeFile = binding.originalRemoveFile;
            }
            if (binding.runWrapper && view.run === binding.runWrapper) {
                view.run = binding.originalRun;
            }
            view.multiSelect = binding.originalMultiSelect;
            view.singleSelect = binding.originalSingleSelect;
            if (binding.metaSelectHandler && typeof view.un === 'function') {
                view.un('beforeclick', binding.metaSelectHandler, view);
            }
            if (binding.contextAfterRender && typeof view.un === 'function') {
                view.un('afterrender', binding.contextAfterRender, view);
            }
            if (binding.contextDomEl && typeof binding.contextDomEl.removeEventListener === 'function') {
                if (binding.contextMouseDownCapture) {
                    binding.contextDomEl.removeEventListener('mousedown', binding.contextMouseDownCapture, true);
                }
                if (binding.contextMenuCapture) {
                    binding.contextDomEl.removeEventListener('contextmenu', binding.contextMenuCapture, true);
                }
            }
            if (binding.destroy && typeof view.un === 'function') {
                view.un('destroy', binding.destroy, view);
            }
        } catch (e) {
            debug('Could not remove Media Browser enhancements', e);
        }
        try {
            delete view.BetterMediaBrowserEnhancement;
        } catch (e) {
            view.BetterMediaBrowserEnhancement = null;
        }
    }

    function bindBrowserEnhancement(view) {
        if (state.disabled || !isBrowserView(view) || view.BetterMediaBrowserEnhancement) {
            return false;
        }

        var binding = {
            originalRemoveFile: view.removeFile,
            originalRun: view.run,
            originalMultiSelect: view.multiSelect,
            originalSingleSelect: view.singleSelect,
            lastSource: getSource(view, view.config ? view.config.tree : null)
        };

        // MODX 3 already sets multiSelect on the media view; MODX 2 does not.
        // These runtime flags are enough for Ext.DataView to use Ctrl/Cmd and Shift selection.
        view.multiSelect = true;
        view.singleSelect = false;

        // ExtJS 3 primarily checks Ctrl for additive selection. Treat Cmd on macOS
        // like Ctrl without replacing the native selection implementation.
        if (typeof view.on === 'function') {
            binding.metaSelectHandler = function (dataView, index, node, event) {
                if (event && event.browserEvent && event.browserEvent.metaKey && !event.ctrlKey) {
                    event.ctrlKey = true;
                }
            };
            view.on('beforeclick', binding.metaSelectHandler, view);
        }

        binding.contextAfterRender = function () {
            attachContextSelectionPreserver(view, binding);
        };
        if (view.rendered) {
            attachContextSelectionPreserver(view, binding);
        } else if (typeof view.on === 'function') {
            view.on('afterrender', binding.contextAfterRender, view, {single: true});
        }

        if (typeof binding.originalRemoveFile === 'function') {
            binding.removeFileWrapper = function () {
                var selected = getSelectedRecords(this);
                var contextSelected = binding.contextSelectionRecords;
                var batchSelection = (contextSelected && contextSelected.length > 1) ? contextSelected : selected;

                // Use the pre-context-menu snapshot when available. ExtJS may already have
                // collapsed the live selection to one file by the time the native MODX
                // "Delete file" handler calls this method.
                binding.contextSelectionRecords = null;
                binding.contextSelectionIndexes = null;

                if (batchSelection.length > 1 &&
                    activeNodeIsSelected(this, batchSelection) &&
                    removeSelectedFiles(this, batchSelection)) {
                    return;
                }
                return binding.originalRemoveFile.apply(this, arguments);
            };
            view.removeFile = binding.removeFileWrapper;
        }

        if (typeof binding.originalRun === 'function') {
            binding.runWrapper = function (params) {
                var originalArguments = arguments;
                var hasExplicitDirectory = !!(params && typeof params.dir !== 'undefined');
                params = params || {};

                // During MODX Media Source changes the view config is updated before
                // view.run() is called, while tree.getSource() can still report the old
                // source for this same event cycle. Prefer the view config here so the
                // previous source's remembered folder is never cleared as if it were root.
                var source = (typeof params.source !== 'undefined') ? params.source :
                    (this.config && typeof this.config.source !== 'undefined' ? this.config.source :
                        getSource(this, this.config ? this.config.tree : null));
                var sourceChanged = !sameSource(binding.lastSource, source);
                var directory = (typeof params.dir !== 'undefined') ? params.dir : this.dir;
                var restoredDirectory = '';

                // MODX resets the view directory to root when switching Media Sources.
                // It does the same when the already active source is selected again from
                // the source combo. Both calls reach view.run() without an explicit dir.
                // In that case the root is only a transient MODX reset and must not clear
                // the remembered folder. Explicit directory loads (including an explicit
                // root click) still win and can intentionally update/clear the state.
                if (!normalizePath(directory) && !hasExplicitOpenTo(this) &&
                    (sourceChanged || !hasExplicitDirectory)) {
                    restoredDirectory = readLastFolder(this, source);
                    if (restoredDirectory) {
                        directory = restoredDirectory;
                        params.dir = restoredDirectory;
                        this.dir = restoredDirectory;
                        if (this.baseParams) {
                            this.baseParams.dir = restoredDirectory;
                        }
                    }
                }

                // Only an explicit directory navigation may clear a remembered folder.
                // A parameter-less run() at root is used internally by MODX while changing
                // or re-selecting Media Sources and must therefore never erase that state.
                if (hasExplicitDirectory || normalizePath(directory)) {
                    rememberLastFolder(this, source, directory);
                }
                binding.lastSource = source;

                var result = restoredDirectory
                    ? binding.originalRun.call(this, params)
                    : binding.originalRun.apply(this, originalArguments);

                if (restoredDirectory) {
                    syncTreeToDirectory(this, restoredDirectory);
                }
                return result;
            };
            view.run = binding.runWrapper;
        }

        binding.destroy = function () {
            unbindBrowserEnhancement(view);
        };
        view.BetterMediaBrowserEnhancement = binding;
        if (typeof view.on === 'function') {
            view.on('destroy', binding.destroy, view);
        }

        // Explicit openTo values always win. Otherwise restore the last folder for this
        // Media Source in this browser tab/session.
        if (!hasExplicitOpenTo(view)) {
            window.setTimeout(function () {
                if (state.disabled || !view.BetterMediaBrowserEnhancement) {
                    return;
                }
                var currentDirectory = normalizePath(view.dir || (view.baseParams ? view.baseParams.dir : ''));
                if (currentDirectory) {
                    rememberLastFolder(view, getSource(view, view.config ? view.config.tree : null), currentDirectory);
                    return;
                }

                var source = getSource(view, view.config ? view.config.tree : null);
                var remembered = readLastFolder(view, source);
                if (!remembered) {
                    return;
                }

                try {
                    view.dir = remembered;
                    view.run({
                        dir: remembered,
                        source: source,
                        allowedFileTypes: getAllowedFileTypes(view),
                        wctx: getWctx(view)
                    });
                    syncTreeToDirectory(view, remembered);
                } catch (e) {
                    debug('Could not restore remembered Media Browser folder', e);
                }
            }, 120);
        }

        return true;
    }

    function bindBrowserEnhancements() {
        if (state.disabled) {
            return;
        }
        Ext.ComponentMgr.all.each(function (cmp) {
            if (isBrowserView(cmp)) {
                bindBrowserEnhancement(cmp);
            }
        });
    }

    function unbindBrowserEnhancements() {
        Ext.ComponentMgr.all.each(function (cmp) {
            if (cmp && cmp.BetterMediaBrowserEnhancement) {
                unbindBrowserEnhancement(cmp);
            }
        });
    }

    BetterMediaBrowser.grid.SearchFilesGrid = function (config) {
        config = config || {};
        this.ident = 'bettermediabrowser-grid-search-' + Ext.id();
        this.browserView = config.browserView;
        this.searchWindowId = config.searchWindowId || '';

        Ext.applyIf(config, {
            id: this.ident,
            url: BetterMediaBrowser.config.connectorUrl,
            baseParams: {
                action: 'mgr/files/search',
                source: config.source,
                allowedFileTypes: config.allowedFileTypes || '',
                wctx: config.wctx || 'web',
                query: ''
            },
            pageSize: 5,
            fields: ['filename', 'path', 'baseurl', 'fullurl', 'thumb', 'directory', 'source'],
            autoHeight: false,
            height: 445,
            paging: true,
            remoteSort: false,
            autoExpandColumn: this.ident + '-path',
            showActionsColumn: false,
            emptyText: _('bettermediabrowser.files_empty'),
            columns: [{
                header: '',
                dataIndex: 'thumb',
                width: 72,
                fixed: true,
                renderer: {
                    fn: function (value, meta, record) {
                        var src = value || (record && record.data ? record.data.thumb : '');
                        src = this.normalizeSearchPreviewUrl(src);
                        if (!src) {
                            return '<span class="bettermediabrowser-search-thumb"></span>';
                        }
                        return '<div class="bettermediabrowser-search-thumb"><img src="' + htmlEncode(src) + '" alt="" /></div>';
                    },
                    scope: this,
                }
            }, {
                id: this.ident + '-path',
                header: _('file_name'),
                dataIndex: 'baseurl',
                sortable: false,
                renderer: function (value) {
                    return htmlEncode(value || '');
                }
            }, {
                header: '',
                dataIndex: 'path',
                width: 54,
                fixed: true,
                renderer: function () {
                    return '<i class="icon icon-folder-open bettermediabrowser-search-open" title="' +
                        _('bettermediabrowser.open_in_browser') + '"></i>';
                }
            }],
            tbar: [{
                xtype: 'textfield',
                itemId: 'filter-search',
                width: 340,
                emptyText: _('bettermediabrowser.search_filename'),
                submitValue: false,
                listeners: {
                    render: {
                        fn: function (cmp) {
                            new Ext.KeyMap(cmp.getEl(), {
                                key: Ext.EventObject.ENTER,
                                fn: function () {
                                    this.searchFiles();
                                },
                                scope: this
                            });
                        },
                        scope: this
                    },
                    afterrender: function (field) {
                        field.focus(false, 250);
                    }
                }
            }, {
                xtype: 'button',
                itemId: 'search-submit',
                text: '<i class="icon icon-search"></i> ' + _('search'),
                handler: this.searchFiles,
                scope: this
            }, {
                xtype: 'button',
                itemId: 'filter-clear',
                text: _('filter_clear'),
                handler: this.clearSearch,
                scope: this
            }],
            listeners: {
                rowdblclick: {
                    fn: function (grid, rowIndex) {
                        var record = grid.getStore().getAt(rowIndex);
                        if (record && record.data) {
                            this.openRecord(record.data);
                        }
                    },
                    scope: this
                }
            }
        });

        BetterMediaBrowser.grid.SearchFilesGrid.superclass.constructor.call(this, config);
    };

    Ext.extend(BetterMediaBrowser.grid.SearchFilesGrid, MODx.grid.Grid, {
        searchFiles: function () {
            var toolbar = this.getTopToolbar();
            var field = toolbar.getComponent('filter-search');
            var store = this.getStore();
            store.baseParams.query = String(field.getValue() || '');
            this.getBottomToolbar().changePage(1);
            this.refresh();
        },
        clearSearch: function () {
            var toolbar = this.getTopToolbar();
            var field = toolbar.getComponent('filter-search');
            var store = this.getStore();
            store.baseParams.query = '';
            field.reset();
            this.getBottomToolbar().changePage(1);
            this.refresh();
        },
        openRecord: function (data) {
            this.selectSearchResultInView(this.browserView, data);
            var searchWindow = Ext.getCmp(this.searchWindowId);
            if (searchWindow) {
                searchWindow.close();
            }
        },
        onClick: function (e) {
            var target = e.getTarget ? e.getTarget() : null;
            if (target && hasClass(target, 'bettermediabrowser-search-open')) {
                var rowIndex = this.getView && this.getView().findRowIndex ? this.getView().findRowIndex(target) : -1;
                var record = rowIndex >= 0 ? this.getStore().getAt(rowIndex) : null;
                if (record && record.data) {
                    this.openRecord(record.data);
                }
                return;
            }
            BetterMediaBrowser.grid.SearchFilesGrid.superclass.onClick.call(this, e);
        },
        normalizeSearchPreviewUrl: function (value) {
            var url = String(value || '');
            if (!url) {
                return '';
            }
            // Handle absolute/protocol/data/blob and the core connector URLs directly.
            if (/^(?:https?:)?\/\//i.test(url) || /^(?:data|blob):/i.test(url) || url.charAt(0) === '/' || url.indexOf('../') === 0 || url.indexOf('./') === 0) {
                return url;
            }
            // Prefix the configured MODX base URL otherwise.
            var baseUrl = MODx.config.base_url;
            return baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
        },
        selectSearchResultInView: function (view, data) {
            if (!view || !data || !data.path || !view.store || typeof view.run !== 'function') {
                return;
            }

            var tree = view.config ? view.config.tree : null;
            var currentSource = getSource(view, tree);
            if (!sameSource(currentSource, data.source)) {
                status(_('bettermediabrowser.error_not_available'), _('bettermediabrowser.error_media_source_changed'));
                return;
            }

            var path = normalizePath(data.path || data.baseurl);
            var directory = normalizePath(data.directory || parentPath(path));
            var allowedFileTypes = this.config.allowedFileTypes;
            var loadHandler = function () {
                window.setTimeout(function () {
                    var selectedIndex = -1;
                    try {
                        view.store.each(function (record, index) {
                            var recordPath = record && record.data ? record.data.pathRelative : '';
                            if (normalizePath(recordPath) === path) {
                                selectedIndex = index;
                                return false;
                            }
                        });

                        if (selectedIndex >= 0) {
                            view.select(selectedIndex);
                        }

                        syncTreeToDirectory(view, directory);
                    } catch (e) {
                        debug('Could not select search result in Media Browser', e);
                    }
                }, 60);
            };

            try {
                if (view.store.on) {
                    view.store.on('load', loadHandler, null, {single: true});
                }
                view.dir = directory;
                view.run({
                    dir: directory,
                    source: currentSource,
                    allowedFileTypes: allowedFileTypes,
                    wctx: this.config.wctx
                });
            } catch (e) {
                debug('Could not navigate Media Browser to search result', e);
            }
        }
    });
    Ext.reg('bettermediabrowser-grid-search-files', BetterMediaBrowser.grid.SearchFilesGrid);

    BetterMediaBrowser.window.SearchFilesWindow = function (config) {
        config = config || {};
        this.ident = 'bettermediabrowser-window-search-' + Ext.id();
        Ext.applyIf(config, {
            id: this.ident,
            title: _('bettermediabrowser.search_files'),
            width: 820,
            height: 545,
            autoHeight: false,
            closeAction: 'close',
            modal: true,
            cls: 'modx-window bettermediabrowser-search-window',
            buttons: null,
            buttonAlign: 'left',
            fbar: [{
                html: '<img class="x-btn-image x-btn-image-visions" src="' + BetterMediaBrowser.config.assetsUrl + 'img/mgr/visions.svg"><img class="x-btn-image x-btn-image-treehillstudio" src="' + BetterMediaBrowser.config.assetsUrl + 'img/mgr/treehill-studio.svg">',
                cls: 'x-btn-logo',
                listeners: {
                    afterrender: function () {
                        this.getEl().select('img').on('click', function () {
                            var msg = '<span style="display:inline-block;text-align:center;width:100%;"><img class="visions" src="' + BetterMediaBrowser.config.assetsUrl + 'img/mgr/visions.svg" alt="Visions"><br><img class="treehill-studio" src="' + BetterMediaBrowser.config.assetsUrl + 'img/mgr/treehill-studio.svg" alt="Treehill Studio"><br>' +
                                '&copy; 2026 by <a href="https://visions.ch" target="_blank">visions.ch</a> and <a href="https://treehillstudio.com" target="_blank">treehillstudio.com</a></span>';
                            Ext.Msg.show({
                                title: _('bettermediabrowser') + ' ' + BetterMediaBrowser.config.version,
                                msg: msg,
                                buttons: Ext.Msg.OK,
                                cls: 'treehillstudio_window',
                                width: 358
                            });
                        });
                    }
                }
            }, '->', {
                text: _('cancel'),
                scope: this,
                handler: this.close
            }],
            fields: [{
                xtype: 'bettermediabrowser-grid-search-files',
                style: 'padding-top: 15px',
                browserView: config.browserView,
                searchWindowId: this.ident,
                source: config.source,
                allowedFileTypes: config.allowedFileTypes || '',
                wctx: config.wctx || 'web',
                cls: 'modx-grid modx-grid-small'
            }],
        });
        BetterMediaBrowser.window.SearchFilesWindow.superclass.constructor.call(this, config);
    };
    Ext.extend(BetterMediaBrowser.window.SearchFilesWindow, MODx.Window, {});
    Ext.reg('bettermediabrowser-window-search-files', BetterMediaBrowser.window.SearchFilesWindow);

    function hasSearchPermission() {
        if (!BetterMediaBrowser.config.search_enabled) {
            return false;
        }
        // Check for file_list permission in MODx.perm
        if (typeof MODx.perm.file_list !== 'undefined') {
            return !!MODx.perm.file_list;
        }
        // Otherwise check the permission on server side in the processor
        return true;
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

    function openSearchWindow(view) {
        if (!hasSearchPermission()) {
            return;
        }

        var tree = view && view.config ? view.config.tree : null;
        var source = getSource(view, tree);
        if (source === null || source === '') {
            return;
        }

        var searchWindow = MODx.load({
            xtype: 'bettermediabrowser-window-search-files',
            browserView: view,
            source: source,
            allowedFileTypes: getAllowedFileTypes(view),
            wctx: getWctx(view)
        });
        searchWindow.show();
    }

    function unbindSearchButton(view) {
        if (!view || !view.BetterMediaBrowserSearchButton) {
            return;
        }
        var binding = view.BetterMediaBrowserSearchButton;
        try {
            if (binding.toolbar && binding.button) {
                binding.toolbar.remove(binding.button, true);
                if (binding.toolbar.doLayout) {
                    binding.toolbar.doLayout();
                }
            }
            if (binding.destroy && typeof view.un === 'function') {
                view.un('destroy', binding.destroy, view);
            }
        } catch (e) {
            debug('Could not remove search button', e);
        }
        try {
            delete view.BetterMediaBrowserSearchButton;
        } catch (e) {
            view.BetterMediaBrowserSearchButton = null;
        }
    }

    function unbindSearchButtons() {
        Ext.ComponentMgr.all.each(function (cmp) {
            if (cmp.BetterMediaBrowserSearchButton) {
                unbindSearchButton(cmp);
            }
        });
    }

    function getSearchButtonInsertIndex(toolbar) {
        var items = toolbar.items.items;
        var i;

        // Return the index of the fill
        for (i = 0; i < items.length; i++) {
            if (items[i].isFill) {
                return i;
            }
        }

        return items.length;
    }

    function bindSearchButton(view) {
        if (state.disabled || !hasSearchPermission() || !isBrowserView(view) || view.BetterMediaBrowserSearchButton ||
            !window.Ext || !view.config || !view.config.tree) {
            return false;
        }

        var tree = view.config.tree;
        var toolbar = tree && tree.getTopToolbar ? tree.getTopToolbar() : null;
        if (!toolbar) {
            return false;
        }

        var button = new Ext.Button({
            itemId: 'bettermediabrowser-search',
            cls: 'x-btn-icon icon-file_search',
            text: '<i class="icon icon-search"></i> ',
            tooltip: _('bettermediabrowser.search_files'),
            tooltipType: 'qtip',
            handler: function () {
                openSearchWindow(view);
            },
        });
        var insertIndex = getSearchButtonInsertIndex(toolbar);

        try {
            if (toolbar.insertButton) {
                toolbar.insertButton(insertIndex, button);
            } else if (toolbar.insert) {
                toolbar.insert(insertIndex, button);
            } else if (toolbar.add) {
                toolbar.add(button);
            } else {
                return false;
            }
            if (toolbar.doLayout) {
                toolbar.doLayout();
            }
        } catch (e) {
            debug('Could not insert search button into MODX Browser tree toolbar', e);
            return false;
        }

        var destroyHandler = function () {
            unbindSearchButton(view);
        };
        view.BetterMediaBrowserSearchButton = {
            toolbar: toolbar,
            button: button,
            tree: tree,
            destroy: destroyHandler
        };
        if (typeof view.on === 'function') {
            view.on('destroy', destroyHandler, view);
        }
        return true;
    }

    function bindSearchButtons() {
        if (state.disabled || !hasSearchPermission()) {
            return;
        }
        Ext.ComponentMgr.all.each(function (cmp) {
            if (isBrowserView(cmp)) {
                bindSearchButton(cmp);
            }
        });
    }

    function startSearchDiscovery() {
        if (state.disabled || !hasSearchPermission() || state.searchDiscoveryTimer) {
            return;
        }

        state.searchDiscoveryAttempts = 0;
        state.searchDiscoveryTimer = window.setInterval(function () {
            if (state.disabled) {
                window.clearInterval(state.searchDiscoveryTimer);
                state.searchDiscoveryTimer = null;
                state.searchDiscoveryAttempts = 0;
                return;
            }

            bindSearchButtons();

            state.searchDiscoveryAttempts++;
            // The Media Browser page is assembled asynchronously. A bounded
            // 5-second discovery window covers initial render without keeping
            // a permanent polling loop alive. Later modal browsers are picked
            // up by the MutationObserver.
            if (state.searchDiscoveryAttempts >= 20) {
                window.clearInterval(state.searchDiscoveryTimer);
                state.searchDiscoveryTimer = null;
                state.searchDiscoveryAttempts = 0;
            }
        }, 250);
    }

    function mutationContainsBrowserItem(node) {
        if (!node || node.nodeType !== 1) {
            return false;
        }
        if (isBrowserItem(node) ||
            hasClass(node, 'modx-browser-view-ct') ||
            hasClass(node, 'modx-browser-window') ||
            hasClass(node, 'modx-browser-panel') ||
            hasClass(node, 'modx-browser-tree') ||
            hasClass(node, 'x-toolbar')) {
            return true;
        }
        return !!(node.querySelector && node.querySelector(
            '.modx-browser-thumb-wrap, .modx-browser-list-item, .modx-browser-view-ct, .modx-browser-window, .modx-browser-panel, .modx-browser-tree, .x-toolbar'
        ));
    }

    function init() {
        if (state.disabled) {
            return;
        }
        try {
            queueScan(document, 0);
            startSearchDiscovery();
            window.setTimeout(function () {
                if (!state.disabled) {
                    queueScan(document, 0);
                }
            }, 250);

            if (window.MutationObserver && document.body) {
                if (state.observer) {
                    state.observer.disconnect();
                }
                state.observer = new MutationObserver(function (mutations) {
                    var i, j, nodes, node;
                    if (state.disabled) {
                        return;
                    }
                    for (i = 0; i < mutations.length; i++) {
                        nodes = mutations[i].addedNodes;
                        for (j = 0; nodes && j < nodes.length; j++) {
                            node = nodes[j];
                            if (mutationContainsBrowserItem(node)) {
                                queueScan(node, 80);
                                startSearchDiscovery();
                            }
                        }
                    }
                });
                state.observer.observe(document.body, {childList: true, subtree: true});
            } else if (!state.fallbackTimer) {
                state.fallbackTimer = window.setInterval(function () {
                    if (state.disabled) {
                        return;
                    }
                    try {
                        scan(document);
                    } catch (e) {
                        debug('Fallback browser scan failed', e);
                    }
                }, 1500);
            }
        } catch (e) {
            debug('Initialization failed; feature remains disabled', e);
        }
    }

    BetterMediaBrowser.disable = function () {
        state.disabled = true;
        clearDrag();
        state.busy = false;
        state.requestToken = null;
        if (state.requestTimer) {
            window.clearTimeout(state.requestTimer);
            state.requestTimer = null;
        }
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
        if (state.fallbackTimer) {
            window.clearInterval(state.fallbackTimer);
            state.fallbackTimer = null;
        }
        if (state.searchDiscoveryTimer) {
            window.clearInterval(state.searchDiscoveryTimer);
            state.searchDiscoveryTimer = null;
        }
        state.searchDiscoveryAttempts = 0;
        if (state.scanTimer) {
            window.clearTimeout(state.scanTimer);
            state.scanTimer = null;
        }
        state.pendingRoots = [];
        state.pendingSince = null;
        unmarkAllItems();
        unbindAllTrees();
        unbindSearchButtons();
        unbindBrowserEnhancements();
    };

    BetterMediaBrowser.enable = function () {
        if (!BetterMediaBrowser.state.disabled) {
            return;
        }
        BetterMediaBrowser.state.disabled = false;
        init();
    };

    Ext.onReady(function () {
        init();
    });
})(window, document);
