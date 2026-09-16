<?php
/**
 * BetterMediaBrowser Plugin
 *
 * @package bettermediabrowser
 *
 * @var modX $modx
 * * @var array $scriptProperties
 */

$className = 'Visions\BetterMediaBrowser\Plugins\Events\\' . $modx->event->name;

$corePath = $modx->getOption('bettermediabrowser.core_path', null, $modx->getOption('core_path') . 'components/bettermediabrowser/');
/** @var BetterMediaBrowser $bettermediabrowser */
$bettermediabrowser = $modx->getService('bettermediabrowser', 'BetterMediaBrowser', $corePath . 'model/bettermediabrowser/', [
    'core_path' => $corePath
]);

if ($bettermediabrowser) {
    if (class_exists($className)) {
        $handler = new $className($modx, $scriptProperties);
        if (get_class($handler) == $className) {
            $handler->run();
        } else {
            $modx->log(xPDO::LOG_LEVEL_ERROR, $className . ' could not be initialized!', '', 'BetterMediaBrowser Plugin');
        }
    } else {
        $modx->log(xPDO::LOG_LEVEL_ERROR, $className . ' was not found!', '', 'BetterMediaBrowser Plugin');
    }
}

return;
