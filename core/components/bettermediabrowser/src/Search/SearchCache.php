<?php
/**
 * File search cache
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search;

use modX;

/**
 * Class SearchCache
 *
 * Caches the file search per Media Source in the bettermediabrowser cache
 * partition. Each Media Source has a cache generation, that is part of all
 * its cache keys, so a new generation invalidates them.
 */
class SearchCache
{
    /** @var modX */
    protected $modx;

    /** @var array */
    protected $cacheOptions;

    /**
     * SearchCache constructor
     *
     * @param modX $modx
     * @param array $cacheOptions
     */
    public function __construct(modX $modx, array $cacheOptions)
    {
        $this->modx = $modx;
        $this->cacheOptions = $cacheOptions;
    }

    /**
     * @param string $key
     * @return mixed
     */
    public function get($key)
    {
        return $this->modx->getCacheManager()->get($key, $this->cacheOptions);
    }

    /**
     * @param string $key
     * @param mixed $value
     * @param int $lifetime
     * @return void
     */
    public function set($key, $value, $lifetime)
    {
        $this->modx->getCacheManager()->set($key, $value, $lifetime, $this->cacheOptions);
    }

    /**
     * Get the cache generation of a Media Source.
     *
     * @param int $sourceId
     * @return string
     */
    public function getGeneration($sourceId)
    {
        $generation = $this->get($this->getGenerationKey($sourceId));
        return is_string($generation) ? $generation : '';
    }

    /**
     * Invalidate the cache of a Media Source.
     *
     * A new generation is used instead of deleting the cache entries, because
     * not every cache handler can delete entries by a key prefix. The old
     * entries expire by their lifetime.
     *
     * @param int $sourceId
     * @return void
     */
    public function clear($sourceId)
    {
        $this->set($this->getGenerationKey($sourceId), uniqid('', true), 0);
    }

    /**
     * Remove the cache of all Media Sources.
     *
     * @return bool
     */
    public function clearAll()
    {
        return $this->modx->getCacheManager()->clean($this->cacheOptions);
    }

    /**
     * @param int $sourceId
     * @return string
     */
    protected function getGenerationKey($sourceId)
    {
        return 'source_' . (int)$sourceId . '_generation';
    }
}
