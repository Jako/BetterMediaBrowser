<?php
/** @var modX $modx */
/** @var string $pluginClass */
/** @var string $pluginEventClass */
/** @var array $sources */
/** @var array $categoryObjects */

$definitions = [
    [
        'name' => 'BetterMediaBrowser',
        'description' => 'Extend the MODX Media Browser.',
        'content' => 'plugin.bettermediabrowser.php',
        'disabled' => 0,
        'events' => [
            [
                'event' => 'OnManagerPageBeforeRender',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnFileManagerUpload',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnFileManagerFileCreate',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnFileManagerFileRename',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnFileManagerFileRemove',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnFileManagerDirRename',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnFileManagerDirRemove',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnFileManagerMoveObject',
                'priority' => 0,
                'propertyset' => 0,
            ],
            [
                'event' => 'OnSiteRefresh',
                'priority' => 0,
                'propertyset' => 0,
            ]
        ]
    ],
];

$plugins = [];
foreach ($definitions as $definition) {
    $plugin = $modx->newObject($pluginClass);
    $plugin->fromArray($definition, '', true, true);

    $filename = $definition['content'];
    $code = file_get_contents($sources['core'] . '/elements/plugins/' . $definition['content']);
    $code = preg_replace('/^\s*<\?php\s*/', '', $code);
    $code = preg_replace('/\?>\s*$/', '', $code);
    $plugin->set('content', $code);

    $events = [];
    foreach ($definition['events'] as $definitionEvent) {
        $event = $modx->newObject($pluginEventClass);
        $event->fromArray($definitionEvent, '', true, true);
        $events[] = $event;
    }
    $plugin->addMany($events);
    $plugins[$filename] = $plugin;
}

return $plugins;
