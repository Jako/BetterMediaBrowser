<?php
/** @var modX $modx */
/** @var string $settingClass */

$definitions = [
    [
        'key' => 'bettermediabrowser.enabled',
        'value' => '1',
        'xtype' => 'combo-boolean',
        'namespace' => 'bettermediabrowser',
        'area' => 'system',
    ],
    [
        'key' => 'bettermediabrowser.debug',
        'value' => '0',
        'xtype' => 'combo-boolean',
        'namespace' => 'bettermediabrowser',
        'area' => 'system',
    ],
    [
        'key' => 'bettermediabrowser.drag_drop_enabled',
        'value' => '1',
        'xtype' => 'combo-boolean',
        'namespace' => 'bettermediabrowser',
        'area' => 'system',
    ],
    [
        'key' => 'bettermediabrowser.search_enabled',
        'value' => '1',
        'xtype' => 'combo-boolean',
        'namespace' => 'bettermediabrowser',
        'area' => 'system',
    ],
    [
        'key' => 'bettermediabrowser.search_min_length',
        'value' => '2',
        'xtype' => 'numberfield',
        'namespace' => 'bettermediabrowser',
        'area' => 'search',
    ],
    [
        'key' => 'bettermediabrowser.search_max_results',
        'value' => '500',
        'xtype' => 'numberfield',
        'namespace' => 'bettermediabrowser',
        'area' => 'search',
    ],
    [
        'key' => 'bettermediabrowser.excluded_folders',
        'value' => '.*/,core/,components/,connectors/,manager/',
        'xtype' => 'textfield',
        'namespace' => 'bettermediabrowser',
        'area' => 'search',
    ],
];

$settings = [];
foreach ($definitions as $definition) {
    $setting = $modx->newObject($settingClass);
    $setting->fromArray($definition, '', true, true);
    $settings[] = $setting;
}

return $settings;
