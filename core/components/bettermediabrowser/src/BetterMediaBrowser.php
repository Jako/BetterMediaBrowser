<?php
/**
 * BetterMediaBrowser
 *
 * Copyright 2026 by visions.ch/Treehill Studio
 *
 * @package bettermediabrowser
 * @subpackage classfile
 */

namespace Visions\BetterMediaBrowser;

use modLexicon;
use modX;
use xPDO;
use xPDOCacheManager;

/**
 * Class BetterMediaBrowser
 */
class BetterMediaBrowser
{
    /**
     * A reference to the modX instance
     * @var modX $modx
     */
    public $modx;

    /**
     * The namespace
     * @var string $namespace
     */
    public $namespace = 'bettermediabrowser';

    /**
     * The package name
     * @var string $packageName
     */
    public $packageName = 'BetterMediaBrowser';

    /**
     * The version
     * @var string $version
     */
    public $version = '1.0.0-pl';

    /**
     * The class options
     * @var array $options
     */
    public $options = [];

    /**
     * The class cache options
     * @var array $cacheOptions
     */
    public $cacheOptions;

    /**
     * BetterMediaBrowser constructor
     *
     * @param modX $modx A reference to the modX instance.
     * @param array $options An array of options. Optional.
     */
    public function __construct(modX &$modx, $options = [])
    {
        $this->modx =& $modx;

        $corePath = $this->getOption('core_path', $options, $this->modx->getOption('core_path', null, MODX_CORE_PATH) . 'components/' . $this->namespace . '/');
        $assetsPath = $this->getOption('assets_path', $options, $this->modx->getOption('assets_path', null, MODX_ASSETS_PATH) . 'components/' . $this->namespace . '/');
        $assetsUrl = $this->getOption('assets_url', $options, $this->modx->getOption('assets_url', null, MODX_ASSETS_URL) . 'components/' . $this->namespace . '/');
        $modxversion = $this->modx->getVersionData();

        // Load some default paths for easier management
        $this->options = array_merge([
            'namespace' => $this->namespace,
            'version' => $this->version,
            'corePath' => $corePath,
            'modelPath' => $corePath . 'model/',
            'vendorPath' => $corePath . 'vendor/',
            'chunksPath' => $corePath . 'elements/chunks/',
            'pagesPath' => $corePath . 'elements/pages/',
            'snippetsPath' => $corePath . 'elements/snippets/',
            'pluginsPath' => $corePath . 'elements/plugins/',
            'controllersPath' => $corePath . 'controllers/',
            'processorsPath' => $corePath . 'processors/',
            'templatesPath' => $corePath . 'templates/',
            'assetsPath' => $assetsPath,
            'assetsUrl' => $assetsUrl,
            'jsUrl' => $assetsUrl . 'js/',
            'cssUrl' => $assetsUrl . 'css/',
            'imagesUrl' => $assetsUrl . 'images/',
            'connectorUrl' => $assetsUrl . 'connector.php'
        ], $options);

        $this->cacheOptions = [
            xPDO::OPT_CACHE_KEY => $this->namespace,
            xPDO::OPT_CACHE_HANDLER => $this->modx->getOption('cache_resource_handler', null, $this->modx->getOption(xPDO::OPT_CACHE_HANDLER)),
            xPDO::OPT_CACHE_FORMAT => (integer)$this->modx->getOption('cache_resource_format', null, $this->modx->getOption(xPDO::OPT_CACHE_FORMAT, null, xPDOCacheManager::CACHE_PHP)),
        ];

        $lexicon = $this->modx->getService('lexicon', modLexicon::class);
        $lexicon->load($this->namespace . ':default');

        // Add default options
        $this->options = array_merge($this->options, [
            'debug' => $this->getBooleanOption('debug', [], false),
            'modxversion' => $modxversion['version'],
            'enabled' => $this->getBooleanOption('enabled', [], true),
            'drag_drop_enabled' => $this->getBooleanOption('drag_drop_enabled', [], true) ,
            'search_enabled' => $this->getBooleanOption('enabled', [], true),
            'search_min_length' => (int)$this->getOption('search_min_length', $options, 2),
            'search_max_results' => (int)$this->getOption('search_max_results', $options, 500),
            'excluded_folders' => $this->getExplodedOption('excluded_folders', $options, '.*/,_*/,core/,components/,connectors/,manager/'),
        ]);
    }

    /**
     * Get a local configuration option or a namespaced system setting by key.
     *
     * @param string $key The option key to search for.
     * @param array $options An array of options that override local options.
     * @param mixed $default The default value returned if the option is not found locally or as a
     * namespaced system setting; by default this value is null.
     * @return mixed The option value or the default value specified.
     */
    public function getOption($key, $options = [], $default = null)
    {
        $option = $default;
        if (!empty($key) && is_string($key)) {
            if ($options != null && array_key_exists($key, $options)) {
                $option = $options[$key];
            } elseif (array_key_exists($key, $this->options)) {
                $option = $this->options[$key];
            } elseif (array_key_exists("$this->namespace.$key", $this->modx->config)) {
                $option = $this->modx->getOption("$this->namespace.$key");
            }
        }
        return $option;
    }

    /**
     * Get Boolean Option
     *
     * @param string $key
     * @param array $options
     * @param mixed $default
     * @return bool
     */
    public function getBooleanOption($key, $options = [], $default = null)
    {
        $option = $this->getOption($key, $options, $default);
        return ($option === 'true' || $option === true || $option === '1' || $option === 1);
    }

    /**
     * @param $value
     * @return array
     */
    public function getExplodedOption($key, $options = [], $default = null)
    {
        $value = $this->getOption($key, $options, $default);
        return ($value !== '') ? array_map('trim', explode(',', rtrim($value, " ,\t\n\r\0\x0B"))) : [];
    }
}
