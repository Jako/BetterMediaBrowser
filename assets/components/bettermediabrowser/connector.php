<?php
/**
 * BetterMediaBrowser connector
 *
 * @package bettermediabrowser
 *
 * @var modX $modx
 */

require_once dirname(dirname(dirname(dirname(__FILE__)))) . '/config.core.php';
require_once MODX_CORE_PATH . 'config/' . MODX_CONFIG_KEY . '.inc.php';
require_once MODX_CONNECTORS_PATH . 'index.php';

$corePath = $modx->getOption('bettermediabrowser.core_path', null, $modx->getOption('core_path') . 'components/bettermediabrowser/');
/** @var BetterMediaBrowser $bettermediabrowser */
$bettermediabrowser = $modx->getService('bettermediabrowser', BetterMediaBrowser::class, $corePath . 'model/bettermediabrowser/', [
    'core_path' => $corePath
]);
$modx->request->handleRequest([
    'processors_path' => $bettermediabrowser->getOption('processorsPath'),
    'location' => '',
]);
