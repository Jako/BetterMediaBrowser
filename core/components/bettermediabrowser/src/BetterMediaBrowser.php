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
use Visions\BetterMediaBrowser\Search\SearchCache;
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
    public modX $modx;

    /**
     * The namespace
     * @var string $namespace
     */
    public string $namespace = 'bettermediabrowser';

    /**
     * The package name
     * @var string $packageName
     */
    public string $packageName = 'BetterMediaBrowser';

    /**
     * The version
     * @var string $version
     */
    public string $version = '1.2.0';

    /**
     * The class options
     * @var array $options
     */
    public array $options = [];

    /**
     * The class cache options
     * @var array $cacheOptions
     */
    public array $cacheOptions = [];

    /**
     * The file search cache
     * @var SearchCache|null $searchCache
     */
    protected ?SearchCache $searchCache = null;

    /**
     * BetterMediaBrowser constructor
     *
     * @param modX $modx A reference to the modX instance.
     * @param array $options An array of options. Optional.
     */
    public function __construct(modX &$modx, array $options = [])
    {
        $this->modx =& $modx;

        $this->options = array_merge($this->getPathOptions($options), $options);
        $this->cacheOptions = $this->getCacheOptions();

        $lexicon = $this->modx->getService('lexicon', modLexicon::class);
        $lexicon->load($this->namespace . ':default');

        $this->options = array_merge($this->options, $this->getDefaultOptions($options));
    }

    /**
     * Get the default paths and URLs for easier management.
     *
     * @param array $options
     * @return array
     */
    protected function getPathOptions(array $options): array
    {
        $corePath = $this->getOption('core_path', $options, $this->modx->getOption('core_path', null, MODX_CORE_PATH) . 'components/' . $this->namespace . '/');
        $assetsPath = $this->getOption('assets_path', $options, $this->modx->getOption('assets_path', null, MODX_ASSETS_PATH) . 'components/' . $this->namespace . '/');
        $assetsUrl = $this->getOption('assets_url', $options, $this->modx->getOption('assets_url', null, MODX_ASSETS_URL) . 'components/' . $this->namespace . '/');

        return [
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
        ];
    }

    /**
     * Get the cache options of the bettermediabrowser cache partition.
     *
     * @return array
     */
    protected function getCacheOptions(): array
    {
        return [
            xPDO::OPT_CACHE_KEY => $this->namespace,
            xPDO::OPT_CACHE_HANDLER => $this->modx->getOption('cache_resource_handler', null, $this->modx->getOption(xPDO::OPT_CACHE_HANDLER)),
            xPDO::OPT_CACHE_FORMAT => (int)$this->modx->getOption('cache_resource_format', null, $this->modx->getOption(xPDO::OPT_CACHE_FORMAT, null, xPDOCacheManager::CACHE_PHP)),
        ];
    }

    /**
     * Get the options from the system settings.
     *
     * @param array $options
     * @return array
     */
    protected function getDefaultOptions(array $options): array
    {
        $modxversion = $this->modx->getVersionData();

        return [
            'debug' => $this->getBooleanOption('debug', [], false),
            'modxversion' => $modxversion['version'],
            'enabled' => $this->getBooleanOption('enabled', [], true),
            'drag_drop_enabled' => $this->getBooleanOption('drag_drop_enabled', [], true),
            'search_enabled' => $this->getBooleanOption('search_enabled', [], true),
            'search_min_length' => (int)$this->getOption('search_min_length', $options, 2),
            'search_max_results' => (int)$this->getOption('search_max_results', $options, 500),
            'excluded_folders' => $this->getExplodedOption('excluded_folders', $options, '.*/,_*/,core/,components/,connectors/,manager/'),
            'list_cache_lifetime' => (int)$this->getOption('list_cache_lifetime', $options, 300),
        ];
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
    public function getOption(string $key, array $options = [], $default = null)
    {
        $option = $default;
        if (!empty($key)) {
            if (array_key_exists($key, $options)) {
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
     * Get a boolean option.
     *
     * @param string $key
     * @param array $options
     * @param mixed $default
     * @return bool
     */
    public function getBooleanOption(string $key, array $options = [], $default = null): bool
    {
        $option = $this->getOption($key, $options, $default);
        return in_array($option, ['true', true, '1', 1], true);
    }

    /**
     * Get a comma separated option as array of trimmed values.
     *
     * @param string $key
     * @param array $options
     * @param mixed $default
     * @return array
     */
    public function getExplodedOption(string $key, array $options = [], $default = null): array
    {
        $value = (string)$this->getOption($key, $options, $default);
        return array_values(array_filter(array_map('trim', explode(',', $value)), 'strlen'));
    }

    /**
     * Get the file search cache.
     *
     * @return SearchCache
     */
    public function getSearchCache(): SearchCache
    {
        if (!$this->searchCache) {
            $this->searchCache = new SearchCache($this->modx, $this->cacheOptions);
        }
        return $this->searchCache;
    }
}
