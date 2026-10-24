/**
 * BetterMediaBrowser - File search grid
 */
(function (window, document) {
    'use strict';

    if (BetterMediaBrowser.grid.SearchFilesGrid) {
        return;
    }

    var debug = BetterMediaBrowser.util.debug;
    var getSource = BetterMediaBrowser.util.getSource;
    var hasClass = BetterMediaBrowser.util.hasClass;
    var htmlEncode = BetterMediaBrowser.util.htmlEncode;
    var normalizePath = BetterMediaBrowser.util.normalizePath;
    var parentPath = BetterMediaBrowser.util.parentPath;
    var sameSource = BetterMediaBrowser.util.sameSource;
    var status = BetterMediaBrowser.util.status;
    var syncTreeToDirectory = BetterMediaBrowser.util.syncTreeToDirectory;

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
            fields: ['filename', 'extension', 'image', 'path', 'baseurl', 'directory', 'source'],
            autoHeight: false,
            height: 445,
            paging: true,
            remoteSort: false,
            autoExpandColumn: this.ident + '-path',
            showActionsColumn: false,
            emptyText: _('bettermediabrowser.files_empty'),
            columns: [{
                header: '',
                dataIndex: 'filename',
                width: 72,
                fixed: true,
                renderer: {
                    fn: function (value, meta, record) {
                        if (record.data.image && record.data.baseurl) {
                            var url = MODx.config.connectors_url + 'system/phpthumb.php';
                            var params = {
                                src: record.data.baseurl,
                                wctx: this.config.wctx || 'web',
                                h: '60',
                                source: record.data.source
                            };
                            return '<div class="bettermediabrowser-search-thumb"><img src="' + url + '?' + Ext.urlEncode(params) + '" alt="' + htmlEncode(record.data.filename) + '"/></div>';
                        }
                        // Same icon classes as the file list of the MODX media browser
                        var extension = String(record.data.extension || '').replace(/[^a-z0-9_-]/gi, '');
                        return '<div class="bettermediabrowser-search-thumb"><span class="icon icon-file' + (extension ? ' icon-' + extension : '') + '"></span></div>';
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
                var rowIndex = this.getView && this.getView().findRowIndex ? this.getView()
                    .findRowIndex(target) : -1;
                var record = rowIndex >= 0 ? this.getStore().getAt(rowIndex) : null;
                if (record && record.data) {
                    this.openRecord(record.data);
                }
                return;
            }
            BetterMediaBrowser.grid.SearchFilesGrid.superclass.onClick.call(this, e);
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
                    view.store.on('load', loadHandler, null, { single: true });
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
})(window, document);
