/**
 * BetterMediaBrowser - Remember the last folder of a media source
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.lastfolder) {
        return;
    }

    var debug = BetterMediaBrowser.util.debug;
    var getWctx = BetterMediaBrowser.util.getWctx;
    var hasUnsafePathSegments = BetterMediaBrowser.util.hasUnsafePathSegments;
    var normalizePath = BetterMediaBrowser.util.normalizePath;

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

    BetterMediaBrowser.lastfolder = {
        hasExplicitOpenTo: hasExplicitOpenTo,
        readLastFolder: readLastFolder,
        rememberLastFolder: rememberLastFolder
    };
})(window, document);
