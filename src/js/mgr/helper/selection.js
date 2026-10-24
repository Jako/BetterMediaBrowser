/**
 * BetterMediaBrowser - Multi-selection context menu with batch delete and download
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.selection) {
        return;
    }

    var debug = BetterMediaBrowser.util.debug;
    var getRecordPath = BetterMediaBrowser.util.getRecordPath;
    var getSelectedRecords = BetterMediaBrowser.util.getSelectedRecords;
    var getSource = BetterMediaBrowser.util.getSource;
    var getWctx = BetterMediaBrowser.util.getWctx;
    var hasUnsafePathSegments = BetterMediaBrowser.util.hasUnsafePathSegments;
    var normalizePath = BetterMediaBrowser.util.normalizePath;
    var refreshView = BetterMediaBrowser.util.refreshView;
    var showFailure = BetterMediaBrowser.util.showFailure;
    var status = BetterMediaBrowser.util.status;

    function hasFileRemovePermission() {
        if (!window.MODx) {
            return false;
        }
        if (MODx.perm && typeof MODx.perm.file_remove !== 'undefined') {
            return !!MODx.perm.file_remove;
        }
        return true;
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
                    view.config.tree.cm.activeNode.id && String(view.config.tree.cm.activeNode.id)
                        .match(/.*?\/$/)) {
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
            _('bettermediabrowser.remove_selected_confirm', { count: total }),
            function (button) {
                if (button !== 'yes') {
                    return;
                }

                var index = 0;
                var removeNext = function () {
                    if (index >= files.length) {
                        refreshAfterBatchDelete(view);
                        status(_('success'), _('bettermediabrowser.msg_files_removed', { count: total }));
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
                status('', _('bettermediabrowser.msg_files_download_started', { count: started }));
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

    BetterMediaBrowser.selection = {
        activeNodeIsSelected: activeNodeIsSelected,
        attachContextSelectionPreserver: attachContextSelectionPreserver,
        removeSelectedFiles: removeSelectedFiles
    };
})(window, document);
