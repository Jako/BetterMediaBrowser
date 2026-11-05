<?php
/**
 * File search cache
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search;

use modX;
use xPDO;

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
    protected modX $modx;

    /** @var array */
    protected array $cacheOptions;

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
    public function get(string $key)
    {
        return $this->modx->getCacheManager()->get($key, $this->cacheOptions);
    }

    /**
     * @param string $key
     * @param mixed $value
     * @param int $lifetime
     * @return void
     */
    public function set(string $key, $value, int $lifetime): void
    {
        $this->modx->getCacheManager()->set($key, $value, $lifetime, $this->cacheOptions);
    }

    /**
     * Get the cache generation of a Media Source.
     *
     * @param int $sourceId
     * @return string
     */
    public function getGeneration(int $sourceId): string
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
    public function clear(int $sourceId): void
    {
        $this->set($this->getGenerationKey($sourceId), uniqid('', true), 0);
    }

    /**
     * Remove the cache of all Media Sources.
     *
     * The file cache handler deletes the files of the bettermediabrowser cache
     * partition. All other cache handlers (Memcache, Memcached, Redis, APC,
     * WinCache) would empty the whole cache storage, including the caches of
     * MODX and other applications. For them, all Media Sources get a new
     * cache generation instead, and the old entries expire by their lifetime.
     *
     * @return bool
     */
    public function clearAll(): bool
    {
        if (!$this->isFileCache()) {
            foreach ($this->getSourceIds() as $sourceId) {
                $this->clear($sourceId);
            }
            return true;
        }

        if ($this->modx->getCacheManager()->clean($this->cacheOptions)) {
            return true;
        }
        // The file cache handler fails, if nothing was cached yet
        return !is_dir($this->modx->getCachePath() . $this->cacheOptions[xPDO::OPT_CACHE_KEY] . '/');
    }

    /**
     * Does the cache partition use the file cache handler?
     *
     * @return bool
     */
    protected function isFileCache(): bool
    {
        $handler = (string)($this->cacheOptions[xPDO::OPT_CACHE_HANDLER] ?? '');
        return $handler === '' || stripos($handler, 'FileCache') !== false;
    }

    /**
     * Get the IDs of all Media Sources.
     *
     * @return int[]
     */
    protected function getSourceIds(): array
    {
        $class = class_exists('MODX\Revolution\Sources\modMediaSource') ? 'MODX\Revolution\Sources\modMediaSource' : 'sources.modMediaSource';
        $query = $this->modx->newQuery($class);
        $query->select($this->modx->getSelectColumns($class, '', '', ['id']));
        if (!$query->prepare() || !$query->stmt->execute()) {
            return [];
        }
        return array_map('intval', $query->stmt->fetchAll(\PDO::FETCH_COLUMN));
    }

    /**
     * @param int $sourceId
     * @return string
     */
    protected function getGenerationKey(int $sourceId): string
    {
        return 'source_' . $sourceId . '_generation';
    }
}
