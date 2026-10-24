/**
 * BetterMediaBrowser - File search window
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.window.SearchFilesWindow) {
        return;
    }

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
})(window, document);
