/**
 * BetterMediaBrowser - File search button in the media browser tree toolbar
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.search) {
        return;
    }

    var state = BetterMediaBrowser.util.state;
    var debug = BetterMediaBrowser.util.debug;
    var getAllowedFileTypes = BetterMediaBrowser.util.getAllowedFileTypes;
    var getSource = BetterMediaBrowser.util.getSource;
    var getWctx = BetterMediaBrowser.util.getWctx;
    var isBrowserView = BetterMediaBrowser.util.isBrowserView;

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

    BetterMediaBrowser.search = {
        bindSearchButtons: bindSearchButtons,
        startSearchDiscovery: startSearchDiscovery,
        unbindSearchButtons: unbindSearchButtons
    };
})(window, document);
