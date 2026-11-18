<?php
/**
 * Remove leftovers of previous versions
 *
 * - The OnSiteRefresh event of the BetterMediaBrowser plugin (until 1.1.0).
 *   The BetterMediaBrowser cache is cleared with its own menu entry since 1.2.0.
 *   The plugin events are not updated in an upgrade, so the event has to be
 *   removed here.
 * - Removed files, that are not deleted by the file vehicle in an upgrade.
 *
 * @package bettermediabrowser
 * @subpackage build
 *
 * @var array $options
 * @var xPDOTransport $transport
 */

/** @var modX $modx */
$modx = $transport->xpdo;

$versionData = $modx->getVersionData();
$isModx3 = isset($versionData['version']) && (int)$versionData['version'] >= 3;

$pluginClass = $isModx3 ? 'MODX\Revolution\modPlugin' : 'modPlugin';
$pluginEventClass = $isModx3 ? 'MODX\Revolution\modPluginEvent' : 'modPluginEvent';

$removedEvents = [
    'BetterMediaBrowser' => ['OnSiteRefresh'],
];

$corePath = $modx->getOption('bettermediabrowser.core_path', null, $modx->getOption('core_path') . 'components/bettermediabrowser/');
$removedFiles = [
    'src/Plugins/Events/OnSiteRefresh.php',
];

switch ($options[xPDOTransport::PACKAGE_ACTION]) {
    case xPDOTransport::ACTION_INSTALL:
    case xPDOTransport::ACTION_UPGRADE:
        foreach ($removedEvents as $pluginName => $events) {
            /** @var modPlugin $plugin */
            $plugin = $modx->getObject($pluginClass, ['name' => $pluginName]);
            if (!$plugin) {
                continue;
            }
            foreach ($events as $event) {
                $pluginEvent = $modx->getObject($pluginEventClass, [
                    'pluginid' => $plugin->get('id'),
                    'event' => $event,
                ]);
                if ($pluginEvent && $pluginEvent->remove()) {
                    $modx->log(xPDO::LOG_LEVEL_INFO, 'Removed the ' . $event . ' event of the ' . $pluginName . ' plugin.');
                }
            }
        }

        foreach ($removedFiles as $file) {
            if (is_file($corePath . $file) && @unlink($corePath . $file)) {
                $modx->log(xPDO::LOG_LEVEL_INFO, 'Removed the file ' . $file . '.');
            }
        }
        break;
}

return true;
