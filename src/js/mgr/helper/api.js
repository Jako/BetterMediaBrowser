/**
 * BetterMediaBrowser - Initialization and DOM observation
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.initialized) {
        return;
    }

    BetterMediaBrowser.initialized = true;

    var state = BetterMediaBrowser.util.state;
    var debug = BetterMediaBrowser.util.debug;
    var hasClass = BetterMediaBrowser.util.hasClass;
    var isBrowserItem = BetterMediaBrowser.util.isBrowserItem;
    var clearDrag = BetterMediaBrowser.dragdrop.clearDrag;
    var hasMovePermission = BetterMediaBrowser.dragdrop.hasMovePermission;
    var markItem = BetterMediaBrowser.dragdrop.markItem;
    var unbindAllTrees = BetterMediaBrowser.dragdrop.unbindAllTrees;
    var unmarkAllItems = BetterMediaBrowser.dragdrop.unmarkAllItems;
    var bindBrowserEnhancements = BetterMediaBrowser.browser.bindBrowserEnhancements;
    var unbindBrowserEnhancements = BetterMediaBrowser.browser.unbindBrowserEnhancements;
    var bindSearchButtons = BetterMediaBrowser.search.bindSearchButtons;
    var startSearchDiscovery = BetterMediaBrowser.search.startSearchDiscovery;
    var unbindSearchButtons = BetterMediaBrowser.search.unbindSearchButtons;

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
                    var i,
                        j,
                        nodes,
                        node;
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
                state.observer.observe(document.body, { childList: true, subtree: true });
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
        if (!state.disabled) {
            return;
        }
        state.disabled = false;
        init();
    };
    Ext.onReady(function () {
        init();
    });
})(window, document);
