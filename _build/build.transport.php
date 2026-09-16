<?php
/**
 * Build BetterMediaBrowser transport package.
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

set_time_limit(0);

const PKG_NAME = 'BetterMediaBrowser';
const PKG_NAME_LOWER = 'bettermediabrowser';
const PKG_VERSION = '1.0.0';
const PKG_RELEASE = 'pl';

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

require_once MODX_CORE_PATH . 'model/modx/modx.class.php';
$modx = modX::getInstance();
$modx->initialize('mgr');
$modx->setLogLevel(xPDO::LOG_LEVEL_INFO);
$modx->setLogTarget(XPDO_CLI_MODE
    ? 'ECHO'
    : 'HTML');

$versionData = $modx->getVersionData();
$isModx3 = isset($versionData['version']) && (int)$versionData['version'] >= 3;

if ($isModx3 && class_exists('MODX\\Revolution\\Transport\\modPackageBuilder')) {
    $builderClass = 'MODX\\Revolution\\Transport\\modPackageBuilder';
    $namespaceClass = 'MODX\\Revolution\\modNamespace';
    $categoryClass = 'MODX\\Revolution\\modCategory';
    $settingClass = 'MODX\Revolution\modSystemSetting';
    $pluginClass = 'MODX\\Revolution\\modPlugin';
    $pluginEventClass = 'MODX\\Revolution\\modPluginEvent';
    $transportClass = class_exists('xPDO\\Transport\\xPDOTransport') ? 'xPDO\\Transport\\xPDOTransport' : 'xPDOTransport';
} else {
    $builderClass = 'modPackageBuilder';
    $namespaceClass = 'modNamespace';
    $categoryClass = 'modCategory';
    $settingClass = 'modSystemSetting';
    $pluginClass = 'modPlugin';
    $pluginEventClass = 'modPluginEvent';
    $transportClass = 'xPDOTransport';
    $modx->loadClass('transport.modPackageBuilder', '', false, true);
}

$builder = new $builderClass($modx);
$builder->directory = $root . '_packages/';
$builder->createPackage(PKG_NAME_LOWER, PKG_VERSION, PKG_RELEASE);

$sources = [
    'root' => $root,
    'build' => $root . '_build/',
    'assets' => $root . 'assets/components/' . PKG_NAME_LOWER,
    'core' => $root . 'core/components/' . PKG_NAME_LOWER,
    'resolvers' => $root . '_build/resolvers/',
    'validators' => $root . '_build/validators/',
    'data' => $root . '_build/data/'
];

$categories = require_once $sources['data'] . 'transport.categories.php';
if (empty ($categories)) {
    @session_write_close();
    $modx->log(xPDO::LOG_LEVEL_INFO, 'No Categories');
    exit();
}

$hasAssets = is_dir($sources['assets']);
$hasCore = is_dir($sources['core']);

$hasContexts = file_exists($sources['data'] . 'transport.contexts.php');
$hasResources = file_exists($sources['data'] . 'transport.resources.php');
$hasValidators = is_dir($sources['build'] . 'validators');
$hasResolvers = is_dir($sources['build'] . 'resolvers');
$hasSetupOptions = is_dir($sources['data'] . 'install.options');
$hasMenu = file_exists($sources['data'] . 'transport.menus.php');
$hasSettings = file_exists($sources['data'] . 'transport.settings.php');
$hasContextSettings = file_exists($sources['data'] . 'transport.contextsettings.php');

$UNIQUE_KEY = constant($transportClass . '::UNIQUE_KEY');
$PRESERVE_KEYS = constant($transportClass . '::PRESERVE_KEYS');
$UPDATE_OBJECT = constant($transportClass . '::UPDATE_OBJECT');
$RELATED_OBJECTS = constant($transportClass . '::RELATED_OBJECTS');
$RELATED_OBJECT_ATTRIBUTES = constant($transportClass . '::RELATED_OBJECT_ATTRIBUTES');

/* Namespace + file resolvers */
$namespace = $modx->newObject($namespaceClass);
$namespace->fromArray([
    'name' => PKG_NAME_LOWER,
    'path' => '{core_path}components/' . PKG_NAME_LOWER . '/',
    'assets_path' => '{assets_path}components/' . PKG_NAME_LOWER . '/',
], '', true, true);

$vehicle = $builder->createVehicle($namespace, [
    $UNIQUE_KEY => 'name',
    $PRESERVE_KEYS => true,
    $UPDATE_OBJECT => true,
]);
if ($hasAssets) {
    $vehicle->resolve('file', [
        'source' => $sources['assets'],
        'target' => "return MODX_ASSETS_PATH . 'components/';",
    ]);
}
if ($hasCore) {
    $vehicle->resolve('file', [
        'source' => $sources['core'],
        'target' => "return MODX_CORE_PATH . 'components/';",
    ]);
}
$builder->putVehicle($vehicle);

// Make the namespace available to subsequent vehicles as package metadata.
$builder->namespace = $namespace;

/* Contexts */
if ($hasContexts) {
    $contexts = require_once $sources['data'] . 'transport.contexts.php';
    if (!is_array($contexts)) {
        $modx->log(xPDO::LOG_LEVEL_ERROR, 'transport.contexts.php contains not an array');
    } else {
        $attributes = [
            xPDOTransport::UNIQUE_KEY => 'key',
            xPDOTransport::PRESERVE_KEYS => true,
            xPDOTransport::UPDATE_OBJECT => false,
        ];
        foreach ($contexts as $context) {
            $vehicle = $builder->createVehicle($context, $attributes);
            $builder->putVehicle($vehicle);
        }
        $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($contexts) . ' contexts');
        unset($contexts, $context, $attributes);
    }
}

/* Resources */
if ($hasResources) {
    $resources = require_once $sources['data'] . 'transport.resources.php';
    if (!is_array($resources)) {
        $modx->log(xPDO::LOG_LEVEL_ERROR, 'transport.resources.php contains not an array');
    } else {
        $attributes = [
            xPDOTransport::PRESERVE_KEYS => false,
            xPDOTransport::UPDATE_OBJECT => true,
            xPDOTransport::UNIQUE_KEY => 'pagetitle',
            xPDOTransport::RELATED_OBJECTS => true,
            xPDOTransport::RELATED_OBJECT_ATTRIBUTES => [
                'ContentType' => [
                    xPDOTransport::PRESERVE_KEYS => false,
                    xPDOTransport::UPDATE_OBJECT => true,
                    xPDOTransport::UNIQUE_KEY => 'name',
                ],
            ],
        ];
        foreach ($resources as $resource) {
            $vehicle = $builder->createVehicle($resource, $attributes);
            $builder->putVehicle($vehicle);
        }
        $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($resources) . ' resources');
    }
    unset($resources, $resource, $attributes);
}

/* System settings */
if ($hasSettings) {
    $settings = require_once $sources['data'] . 'transport.settings.php';
    if (!is_array($settings)) {
        $modx->log(xPDO::LOG_LEVEL_ERROR, 'transport.settings.php data contains not an array');
    } else {
        foreach ($settings as $setting) {
            $vehicle = $builder->createVehicle($setting, [
                $UNIQUE_KEY => 'key',
                $PRESERVE_KEYS => true,
                $UPDATE_OBJECT => false,
            ]);
            $builder->putVehicle($vehicle);
        }
        $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($settings) . ' system settings');
    }
}

/* Context Settings */
if ($hasContextSettings) {
    $settings = require_once $sources['data'] . 'transport.contextsettings.php';
    if (!is_array($settings)) {
        $modx->log(xPDO::LOG_LEVEL_ERROR, 'transport.contextsettings.php contains not an array');
    } else {
        $attributes = [
            xPDOTransport::UNIQUE_KEY => 'key',
            xPDOTransport::PRESERVE_KEYS => true,
            xPDOTransport::UPDATE_OBJECT => false,
        ];
        foreach ($settings as $setting) {
            $vehicle = $builder->createVehicle($setting, $attributes);
            $builder->putVehicle($vehicle);
        }
        $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($settings) . ' context settings');
        unset($settings, $setting, $attributes);
    }
}

/* Categories */
$i = 0;
$count = count($categories);
$categoryObjects = [];
foreach ($categories as $parent => $categoryName) {
    $categoryNameLower = strtolower($categoryName);

    $hasSnippets = file_exists($sources['data'] . $categoryNameLower . '/transport.snippets.php');
    $hasChunks = file_exists($sources['data'] . $categoryNameLower . '/transport.chunks.php');
    $hasTemplates = file_exists($sources['data'] . $categoryNameLower . '/transport.templates.php');
    $hasTemplateVariables = file_exists($sources['data'] . $categoryNameLower . '/transport.tvs.php');
    $hasPlugins = file_exists($sources['data'] . $categoryNameLower . '/transport.plugins.php');
    $hasPropertySets = file_exists($sources['data'] . $categoryNameLower . '/transport.propertysets.php');

    /* @var $category modCategory */
    $category = $modx->newObject('modCategory');
    $i++; /* will be 1 for the first category */
    $category->set('id', $i);
    $category->set('category', $categoryName);
    $categoryObjects[$categoryName] = $category;
    if ($parent === 0) {
        $categoryObjects[$categoryName] = $category;
    } else {
        if (isset($categoryObjects[$parent])) {
            $category->addOne($categoryObjects[$parent], 'Parent');
        } else {
            $modx->log(xPDO::LOG_LEVEL_INFO, 'Invalid category parent "' . $parent . '"');
            exit();
        }
    }

    /* Snippets */
    if ($hasSnippets) {
        $snippets = require_once $sources['data'] . $categoryNameLower . '/transport.snippets.php';
        if (is_array($snippets)) {
            if ($category->addMany($snippets, 'Snippets')) {
                $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($snippets) . ' Snippets');
            } else {
                $modx->log(xPDO::LOG_LEVEL_FATAL, 'Adding Snippets failed');
            }
        } else {
            $modx->log(xPDO::LOG_LEVEL_FATAL, 'transport.snippets.php contains not an array');
        }
    }

    /* Property Sets */
    if ($hasPropertySets) {
        $propertySets = require_once $sources['data'] . $categoryNameLower . '/transport.propertysets.php';
        if (is_array($propertySets)) {
            if ($category->addMany($propertySets, 'PropertySets')) {
                $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($propertySets) . ' PropertySets');
            } else {
                $modx->log(xPDO::LOG_LEVEL_FATAL, 'Adding PropertySets failed');
            }
        } else {
            $modx->log(xPDO::LOG_LEVEL_FATAL, 'transport.propertysets.php contains not an array');
        }
    }

    /* Chunks */
    if ($hasChunks) {
        $chunks = require_once $sources['data'] . $categoryNameLower . '/transport.chunks.php';
        if (is_array($chunks)) {
            if ($category->addMany($chunks, 'Chunks')) {
                $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($chunks) . ' Chunks');
            }  else {
                $modx->log(xPDO::LOG_LEVEL_FATAL, 'Adding Chunks failed');
            }
        } else {
            $modx->log(xPDO::LOG_LEVEL_FATAL, 'transport.chunks.php contains not an array');
        }
    }

    /* Templates */
    if ($hasTemplates) {
        $templates = require_once $sources['data'] . $categoryNameLower . '/transport.templates.php';
        if (is_array($templates)) {
            if ($category->addMany($templates, 'Templates')) {
                $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($templates) . ' Templates');
            } else {
                $modx->log(xPDO::LOG_LEVEL_FATAL, 'Adding Templates failed');
            }
        } else {
            $modx->log(xPDO::LOG_LEVEL_FATAL, 'transport.templates.php contains not an array');
        }
    }

    /* Template Variables */
    if ($hasTemplateVariables) {
        /* note: Template Variables' default properties are set in transport.tvs.php */
        $tvs = require_once $sources['data'] . $categoryNameLower . '/transport.tvs.php';
        if (is_array($tvs)) {
            if ($category->addMany($tvs, 'TemplateVars')) {
                $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($tvs) . ' Template Variables');
            } else {
                $modx->log(xPDO::LOG_LEVEL_FATAL, 'Adding Template Variables failed');
            }
        } else {
            $modx->log(xPDO::LOG_LEVEL_FATAL, 'transport.tvs.php contains not an array');
        }
    }

    /* Plugins */
    if ($hasPlugins) {
        $plugins = require_once $sources['data'] . $categoryNameLower . '/transport.plugins.php';
        if (is_array($plugins)) {
            foreach ($plugins as $plugin) {
                if (is_array($plugins)) {
                    if ($category->addMany($plugins, 'Plugins')) {
                        $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . count($plugins) . ' plugins');
                    } else {
                        $modx->log(xPDO::LOG_LEVEL_FATAL, 'Adding Plugins failed');
                    }
                }
            }
        } else {
            $modx->log(xPDO::LOG_LEVEL_FATAL, 'transport.plugins.php contains not an array');
        }
    }

    $attr = [
        xPDOTransport::UNIQUE_KEY => 'category',
        xPDOTransport::PRESERVE_KEYS => false,
        xPDOTransport::UPDATE_OBJECT => true,
        xPDOTransport::RELATED_OBJECTS => true,
    ];

    if ($hasValidators && $i == 1) { // Install validators only on first pass
        $attr[xPDOTransport::ABORT_INSTALL_ON_VEHICLE_FAIL] = true;
    }

    if ($hasSnippets) {
        $attr[xPDOTransport::RELATED_OBJECT_ATTRIBUTES]['Snippets'] = [
            xPDOTransport::PRESERVE_KEYS => false,
            xPDOTransport::UPDATE_OBJECT => true,
            xPDOTransport::UNIQUE_KEY => 'name',
        ];
    }

    if ($hasPropertySets) {
        $attr[xPDOTransport::RELATED_OBJECT_ATTRIBUTES]['PropertySets'] = [
            xPDOTransport::PRESERVE_KEYS => false,
            xPDOTransport::UPDATE_OBJECT => true,
            xPDOTransport::UNIQUE_KEY => 'name',
        ];
    }

    if ($hasChunks) {
        $attr[xPDOTransport::RELATED_OBJECT_ATTRIBUTES]['Chunks'] = [
            xPDOTransport::PRESERVE_KEYS => false,
            xPDOTransport::UPDATE_OBJECT => true,
            xPDOTransport::UNIQUE_KEY => 'name',
        ];
    }

    if ($hasTemplates) {
        $attr[xPDOTransport::RELATED_OBJECT_ATTRIBUTES]['Templates'] = [
            xPDOTransport::PRESERVE_KEYS => false,
            xPDOTransport::UPDATE_OBJECT => true,
            xPDOTransport::UNIQUE_KEY => 'templatename',
        ];
    }

    if ($hasTemplateVariables) {
        $attr[xPDOTransport::RELATED_OBJECT_ATTRIBUTES]['TemplateVars'] = [
            xPDOTransport::PRESERVE_KEYS => false,
            xPDOTransport::UPDATE_OBJECT => true,
            xPDOTransport::UNIQUE_KEY => 'name',
        ];
    }

    if ($hasPlugins) {
        $attr[xPDOTransport::RELATED_OBJECT_ATTRIBUTES]['Plugins'] = [
            xPDOTransport::PRESERVE_KEYS => false,
            xPDOTransport::UPDATE_OBJECT => true,
            xPDOTransport::UNIQUE_KEY => 'name',
            xPDOTransport::RELATED_OBJECTS => true,
            xPDOTransport::RELATED_OBJECT_ATTRIBUTES => array (
                'PluginEvents' => array(
                    xPDOTransport::PRESERVE_KEYS => true,
                    xPDOTransport::UPDATE_OBJECT => false,
                    xPDOTransport::UNIQUE_KEY => array('pluginid','event'),
                ),
            ),
        ];
    }

    $vehicle = $builder->createVehicle($category, $attr);

    if ($hasValidators && $i == 1) { /* add validators to the first category */
        $validators = empty($props['validators']) ? [] : $props['validators'];
        if (!empty($validators)) {
            foreach ($validators as $validator) {
                if ($validator == 'default') {
                    $validator = PKG_NAME_LOWER;
                }
                $file = $sources['validators'] . $validator . '.validator.php';
                if (file_exists($file)) {
                    $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . $validator . ' validator');
                    $vehicle->validate('php', [
                        'source' => $file,
                    ]);
                } else {
                    $modx->log(xPDO::LOG_LEVEL_ERROR, 'Could not find validator file: ' . $file);
                }
            }
        }
    }

    if ($hasResolvers && ($i == $count)) {
        /* add resolvers to last category only */
        $resolvers = empty($props['resolvers']) ? [] : $props['resolvers'];
        foreach ($resolvers as $resolver) {
            if ($resolver == 'default') {
                $resolver = PKG_NAME_LOWER;
            }
            $file = $sources['resolvers'] . $resolver . '.resolver.php';
            if (file_exists($file)) {
                $modx->log(xPDO::LOG_LEVEL_INFO, 'Packaged ' . $resolver . ' Resolver');
                $vehicle->resolve('php', [
                    'source' => $sources['resolvers'] . $resolver . '.resolver.php',
                ]);
            } else {
                $modx->log(xPDO::LOG_LEVEL_ERROR, 'Could not find resolver file: ' . $file);
            }
        }
    }

    $builder->putVehicle($vehicle);
}



$builder->setPackageAttributes([
    'license' => file_get_contents($root . 'LICENSE'),
    'readme' => file_get_contents($root . 'README.md'),
    'changelog' => file_get_contents($root . 'CHANGELOG.md'),
]);

$modx->log(xPDO::LOG_LEVEL_INFO, 'Packing ' . PKG_NAME_LOWER . '-' . PKG_VERSION . '-' . PKG_RELEASE . '.transport.zip');
$builder->pack();
$modx->cacheManager->deleteTree($root . '_packages/' . $builder->getSignature(), [
    'deleteTop' => true,
    'extensions' => []
]);
$modx->log(xPDO::LOG_LEVEL_INFO, 'Build finished.');
