<?php
/**
 * BetterMediaBrowser bootstrap (MODX 3)
 *
 * Registers the BetterMediaSource media source type. MODX 2 loads it with
 * the extension_packages system setting instead.
 *
 * @package bettermediabrowser
 *
 * @var \MODX\Revolution\modX $modx
 * @var array $namespace
 */

require_once __DIR__ . '/vendor/autoload.php';

$modx->addPackage('Visions\BetterMediaBrowser\Model', __DIR__ . '/src/', null, 'Visions\\BetterMediaBrowser\\');
