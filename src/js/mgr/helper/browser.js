/**
 * BetterMediaBrowser - Enhancements of the media browser view
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.browser) {
        return;
    }

    var state = BetterMediaBrowser.util.state;
    var debug = BetterMediaBrowser.util.debug;
    var getAllowedFileTypes = BetterMediaBrowser.util.getAllowedFileTypes;
    var getSelectedRecords = BetterMediaBrowser.util.getSelectedRecords;
    var getSource = BetterMediaBrowser.util.getSource;
    var getWctx = BetterMediaBrowser.util.getWctx;
    var isBrowserView = BetterMediaBrowser.util.isBrowserView;
    var normalizePath = BetterMediaBrowser.util.normalizePath;
    var sameSource = BetterMediaBrowser.util.sameSource;
    var syncTreeToDirectory = BetterMediaBrowser.util.syncTreeToDirectory;
    var activeNodeIsSelected = BetterMediaBrowser.selection.activeNodeIsSelected;
    var attachContextSelectionPreserver = BetterMediaBrowser.selection.attachContextSelectionPreserver;
    var removeSelectedFiles = BetterMediaBrowser.selection.removeSelectedFiles;
    var hasExplicitOpenTo = BetterMediaBrowser.lastfolder.hasExplicitOpenTo;
    var readLastFolder = BetterMediaBrowser.lastfolder.readLastFolder;
    var rememberLastFolder = BetterMediaBrowser.lastfolder.rememberLastFolder;

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
            view.on('afterrender', binding.contextAfterRender, view, { single: true });
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

        // Explicit openTo values always win. Otherwise, restore the last folder for this
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

    BetterMediaBrowser.browser = {
        bindBrowserEnhancements: bindBrowserEnhancements,
        unbindBrowserEnhancements: unbindBrowserEnhancements
    };
})(window, document);
