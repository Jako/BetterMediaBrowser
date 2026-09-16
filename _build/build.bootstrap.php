<?php
/**
 * Bootstrap BetterMediaBrowser elements.
 *
 * Run this script from a MODX Revolution 2.8.x or 3.x installation.
 *
 * @var $modx modX
 *
 */
if (PHP_SAPI !== 'cli') {
    if (!headers_sent()) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: text/plain; charset=UTF-8');
    }
    exit('This build script must be executed from the command line.');
}

// Set GET/REQUEST parameter in CLI mode
if (!empty($argv)) {
    parse_str(implode('&', array_slice($argv, 1)), $_REQUEST);
    $_GET = $_REQUEST;
}

set_time_limit(0);

const PKG_NAME = 'BetterMediaBrowser';
const PKG_NAME_LOWER = 'bettermediabrowser';

$root = dirname(__DIR__) . '/';
$buildConfig = __DIR__ . '/build.config.php';
if (file_exists($buildConfig)) {
    require_once $buildConfig;
}

if (!defined('MODX_CORE_PATH')) {
    $message = "MODX_CORE_PATH is not defined. Copy _build/build.config.sample.php to _build/build.config.php and adjust the path inside.\n";
    if (defined('STDERR')) {
        fwrite(STDERR, $message);
    } else {
        echo nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
    }
    exit(1);
}

$rootConfig = $root . '/config.core.php';
file_put_contents($rootConfig, <<<EOF
<?php
require(dirname(__DIR__, 2) . '/config.core.php');
EOF
);

require_once MODX_CORE_PATH . 'model/modx/modx.class.php';
$modx = modX::getInstance();
$modx->initialize('mgr');
$modx->setLogLevel(modX::LOG_LEVEL_INFO);
$modx->setLogTarget('ECHO');

$pkgAbsolutePath = dirname(__DIR__, 2) . '/' . PKG_NAME_LOWER;
$pkgRelativePath = '/Extras/' . PKG_NAME_LOWER;

$versionData = $modx->getVersionData();
$isModx3 = isset($versionData['version']) && (int)$versionData['version'] >= 3;

if ($isModx3) {
    $namespaceClass = 'MODX\\Revolution\\modNamespace';
    $categoryClass = 'MODX\\Revolution\\modCategory';
    $settingClass = 'MODX\Revolution\modSystemSetting';
    $pluginClass = 'MODX\\Revolution\\modPlugin';
    $pluginEventClass = 'MODX\\Revolution\\modPluginEvent';
} else {
    $namespaceClass = 'modNamespace';
    $categoryClass = 'modCategory';
    $settingClass = 'modSystemSetting';
    $pluginClass = 'modPlugin';
    $pluginEventClass = 'modPluginEvent';
}

foreach ([PKG_NAME_LOWER . '.assets_path' => $pkgAbsolutePath . '/assets/components/' . PKG_NAME_LOWER . '/',
             PKG_NAME_LOWER . '.assets_url' => $pkgRelativePath . '/assets/components/' . PKG_NAME_LOWER . '/',
             PKG_NAME_LOWER . '.core_path' => $pkgAbsolutePath . '/core/components/' . PKG_NAME_LOWER . '/',
         ] as $key => $value) {
    $settingObject = $modx->getObject($settingClass, [
        'key' => $key
    ]);
    if (!$settingObject) {
        /** @var modSystemSetting $settingObject */
        $settingObject = $modx->newObject($settingClass);
    }
    $settingObject->fromArray([
        'key' => $key,
        'value' => $value,
        'xtype' => 'textfield',
        'namespace' => PKG_NAME_LOWER,
        'area' => 'system'
    ], '', true, true);
    $settingObject->save();
}

$modx->log(xPDO::LOG_LEVEL_INFO, 'Bootstrap system settings of ' . PKG_NAME . ' finished');

$namespace = $modx->getObject($namespaceClass, [
    'name' => PKG_NAME_LOWER
]);
if (!$namespace) {
    $namespace = $modx->newObject($namespaceClass);
    $namespace->fromArray([
        'name' => PKG_NAME_LOWER,
        'path' => $pkgAbsolutePath . '/core/components/' . PKG_NAME_LOWER . '/',
        'assets_path' => $pkgAbsolutePath . '/assets/components/' . PKG_NAME_LOWER . '/',
    ], '', true, true);
    $namespace->save();
}

$modx->log(xPDO::LOG_LEVEL_INFO, 'Bootstrap namespace of ' . PKG_NAME . ' finished');

$sources = [
    'core' => $root . 'core/components/' . PKG_NAME_LOWER,
    'data' => __DIR__ . '/data/',
];

/* System settings */
$settings = include $sources['data'] . 'transport.settings.php';
foreach ($settings as $setting) {
    $settingObject = $modx->getObject($settingClass, [
        'key' => $setting->get('key')
    ]);
    if (!$settingObject) {
        /** @var modSystemSetting $settingObject */
        $settingObject = $modx->newObject($settingClass);
        $settingObject->fromArray($setting->toArray(), '', true, true);
        $settingObject->save();
    }
}

$modx->log(xPDO::LOG_LEVEL_INFO, 'Bootstrap system settings of ' . PKG_NAME . ' finished');

/* Categories */
$categoryObjects = [];
$categories = include $sources['data'] . 'transport.categories.php';
foreach ($categories as $parent => $categoryName) {
    $categoryNameLower = strtolower($categoryName);

    /* @var $categoryObject modCategory */
    $categoryObject = $modx->getObject($categoryClass, [
        'category' => $categoryName
    ]);
    if (!$categoryObject) {
        $categoryObject = $modx->newObject($categoryClass);
        $categoryObject->fromArray([
            'category' => $categoryName,
        ]);
    }
    if ($parent === 0) {
        $categoryObjects[$categoryName] = $categoryObject;
    } else {
        if (isset($categoryObjects[$parent])) {
            $categoryObject->addOne($categoryObjects[$parent], 'Parent');
        } else {
            $modx->log(xPDO::LOG_LEVEL_INFO, 'Invalid category parent "' . $parent . '"');
            exit();
        }
    }
    $categoryObject->save();

    /* Plugins */
    $plugins = include $sources['data'] . $categoryNameLower . '/' . 'transport.plugins.php';
    foreach ($plugins as $filename => $plugin) {
        $pluginObject = $modx->getObject($pluginClass, [
            'name' => $plugin->get('name')
        ]);
        if (!$pluginObject) {
            /** @var modPlugin $pluginObject */
            $pluginObject = $plugin;
        }
        $pluginObject->fromArray($plugin->toArray(), '', true, true);
        $pluginObject->set('plugincode', 'include("' . $sources['core'] . '/elements/plugins/' . $filename . '");');
        $pluginObject->addOne($categoryObject, 'Category');
        $pluginObject->save();
    }

    $modx->log(xPDO::LOG_LEVEL_INFO, 'Bootstrap plugins of ' . PKG_NAME . ' in category ' . $categoryObject->get('category') . ' finished');
}
