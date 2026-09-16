var bettermediabrowser = function (config) {
    config = config || {};
    bettermediabrowser.superclass.constructor.call(this, config);
};
Ext.extend(bettermediabrowser, Ext.Component, {
    initComponent: function () {
        this.stores = {};
        this.ajax = new Ext.data.Connection({
            disableCaching: true,
        });
    }, page: {}, window: {}, grid: {}, tree: {}, panel: {}, combo: {}, config: {}, util: {}, form: {}
});
Ext.reg('bettermediabrowser', bettermediabrowser);

BetterMediaBrowser = new bettermediabrowser();
