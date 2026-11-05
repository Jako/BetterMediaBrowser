<?php
/** @var modX $modx */
/** @var string $menuClass */

$handler = <<<'JS'
MODx.Ajax.request({
    url: (MODx.config['bettermediabrowser.assets_url'] || MODx.config.assets_url + 'components/bettermediabrowser/') + 'connector.php',
    params: {
        action: 'mgr/cache/clear'
    },
    listeners: {
        success: {
            fn: function (r) {
                MODx.msg.status({
                    title: _('success'),
                    message: r.message,
                    delay: 3
                });
            }
        }
    }
});
return false;
JS;

$menus = [];

$menu = $modx->newObject($menuClass);
$menu->fromArray([
    'text' => 'bettermediabrowser.menu_clear_cache',
    'description' => 'bettermediabrowser.menu_clear_cache_desc',
    'parent' => 'refresh_site',
    'action' => '',
    'namespace' => 'bettermediabrowser',
    'permissions' => 'empty_cache',
    'menuindex' => 1,
    'handler' => $handler,
    'params' => '',
    'icon' => '',
], '', true, true);
$menus[] = $menu;

return $menus;
