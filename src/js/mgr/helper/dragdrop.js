/**
 * BetterMediaBrowser - Drag and drop of files onto the folder tree
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.dragdrop) {
        return;
    }

    var state = BetterMediaBrowser.util.state;
    var closestClass = BetterMediaBrowser.util.closestClass;
    var debug = BetterMediaBrowser.util.debug;
    var findBrowserView = BetterMediaBrowser.util.findBrowserView;
    var findTreeNodeByPath = BetterMediaBrowser.util.findTreeNodeByPath;
    var getRecordData = BetterMediaBrowser.util.getRecordData;
    var getSelectedRecords = BetterMediaBrowser.util.getSelectedRecords;
    var getSource = BetterMediaBrowser.util.getSource;
    var getTreeNodePath = BetterMediaBrowser.util.getTreeNodePath;
    var hasUnsafePathSegments = BetterMediaBrowser.util.hasUnsafePathSegments;
    var htmlEncode = BetterMediaBrowser.util.htmlEncode;
    var normalizePath = BetterMediaBrowser.util.normalizePath;
    var parentPath = BetterMediaBrowser.util.parentPath;
    var refreshView = BetterMediaBrowser.util.refreshView;
    var reloadNode = BetterMediaBrowser.util.reloadNode;
    var safeDecode = BetterMediaBrowser.util.safeDecode;
    var sameSource = BetterMediaBrowser.util.sameSource;
    var showFailure = BetterMediaBrowser.util.showFailure;
    var showTimeout = BetterMediaBrowser.util.showTimeout;
    var status = BetterMediaBrowser.util.status;
    var stripTags = BetterMediaBrowser.util.stripTags;

    function failSafe(context, error) {
        debug(context, error);
        clearDrag();
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

        return { node: node, row: row };
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
                    state.target.row.className = String(state.target.row.className || '')
                        .replace(/\bbettermediabrowser-drop-target\b/g, '');
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
                        dragItems[dragIndex].className = String(dragItems[dragIndex].className || '')
                            .replace(/\bbettermediabrowser-drag-source\b/g, '');
                    }
                }
            } catch (e) {
                debug('Could not clear drag source styling', e);
            }
        }
        state.drag = null;
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

    BetterMediaBrowser.dragdrop = {
        clearDrag: clearDrag,
        hasMovePermission: hasMovePermission,
        markItem: markItem,
        unbindAllTrees: unbindAllTrees,
        unmarkAllItems: unmarkAllItems
    };
})(window, document);
