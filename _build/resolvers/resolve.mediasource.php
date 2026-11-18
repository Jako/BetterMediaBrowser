<?php
/**
 * Resolve the BetterMediaSource media source type
 *
 * MODX 3 registers the media source type in the namespace bootstrap.php,
 * MODX 2 needs an extension package for it.
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

$packageName = 'bettermediabrowser';
$packagePath = '[[++core_path]]components/bettermediabrowser/model/';

/**
 * Is the extension package registered in the extension_packages system setting?
 *
 * @param modX $modx
 * @param string $packageName
 * @return bool
 */
$hasExtensionPackage = function ($modx, $packageName) use ($isModx3) {
    $setting = $modx->getObject($isModx3 ? 'MODX\Revolution\modSystemSetting' : 'modSystemSetting', [
        'key' => 'extension_packages'
    ]);
    if (!$setting) {
        return false;
    }
    $value = $setting->get('value');
    $value = is_array($value) ? $value : json_decode((string)$value, true);
    if (!is_array($value)) {
        return false;
    }
    foreach ($value as $package) {
        if (is_array($package) && array_key_exists($packageName, $package)) {
            return true;
        }
    }
    return false;
};

switch ($options[xPDOTransport::PACKAGE_ACTION]) {
    case xPDOTransport::ACTION_INSTALL:
    case xPDOTransport::ACTION_UPGRADE:
        if ($isModx3) {
            // An installation upgraded from MODX 2 could still contain the MODX 2 extension package
            if ($hasExtensionPackage($modx, $packageName)) {
                $modx->removeExtensionPackage($packageName);
            }
            // The media sources of an installation upgraded from MODX 2 use the MODX 2 class key
            $modx->updateCollection('MODX\Revolution\Sources\modMediaSource', [
                'class_key' => 'Visions\BetterMediaBrowser\Model\BetterMediaSource'
            ], [
                'class_key' => 'BetterMediaSource'
            ]);
        } elseif (!$hasExtensionPackage($modx, $packageName)) {
            $modx->addExtensionPackage($packageName, $packagePath);
        }
        break;
    case xPDOTransport::ACTION_UNINSTALL:
        if ($hasExtensionPackage($modx, $packageName)) {
            $modx->removeExtensionPackage($packageName);
        }

        // Convert the BetterMediaSource media sources to file system media sources,
        // so that they still work without the package
        if ($isModx3) {
            $count = $modx->updateCollection('MODX\Revolution\Sources\modMediaSource', [
                'class_key' => 'MODX\Revolution\Sources\modFileMediaSource'
            ], [
                'class_key' => 'Visions\BetterMediaBrowser\Model\BetterMediaSource'
            ]);
        } else {
            $count = $modx->updateCollection('sources.modMediaSource', [
                'class_key' => 'sources.modFileMediaSource'
            ], [
                'class_key' => 'BetterMediaSource'
            ]);
        }
        if ($count) {
            $modx->log(xPDO::LOG_LEVEL_INFO, 'Converted ' . $count . ' BetterMediaSource media sources to file system media sources.');
        }
        break;
}

return true;
