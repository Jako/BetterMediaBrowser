<?php
/**
 * File search
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search;

use modMediaSource;
use Throwable;
use Visions\BetterMediaBrowser\BetterMediaBrowser;
use Visions\BetterMediaBrowser\Search\Scanners\ContainerScanner;
use Visions\BetterMediaBrowser\Search\Scanners\FilesystemScanner;
use Visions\BetterMediaBrowser\Search\Scanners\LocalScanner;
use Visions\BetterMediaBrowser\Search\Scanners\Scanner;
use xPDO;

/**
 * Class FileSearch
 *
 * Searches the files of a Media Source by name. An index of all files is
 * cached, so only the first search scans the Media Source and all following
 * searches (i.e. while typing) just filter the index. Media Sources with
 * too many files are searched directly.
 */
class FileSearch
{
    const INDEX_LIMIT = 50000;
    const INDEX_LIFETIME = 300;
    const INDEX_TOO_LARGE = 'too_large';
    const RESULTS_LIFETIME = 60;

    /** @var BetterMediaBrowser */
    protected $bettermediabrowser;

    /** @var SearchCache */
    protected $cache;

    /** @var int */
    protected $sourceId;

    /** @var FileFilter */
    protected $filter;

    /** @var int */
    protected $maxResults;

    /** @var Scanner[] Scanners in the order they are tried */
    protected $scanners;

    /**
     * FileSearch constructor
     *
     * @param BetterMediaBrowser $bettermediabrowser
     * @param modMediaSource $source An initialized Media Source
     * @param FileFilter $filter
     * @param int $maxResults
     * @param Scanner[]|null $scanners Null uses the fastest available scanners
     */
    public function __construct(BetterMediaBrowser $bettermediabrowser, $source, FileFilter $filter, $maxResults, $scanners = null)
    {
        $this->bettermediabrowser = $bettermediabrowser;
        $this->cache = $bettermediabrowser->getSearchCache();
        $this->sourceId = (int)$source->get('id');
        $this->filter = $filter;
        $this->maxResults = $maxResults;
        $this->scanners = ($scanners !== null) ? $scanners : self::getScanners($source, $filter);
    }

    /**
     * Get the scanners for a Media Source, the fastest first.
     *
     * @param modMediaSource $source
     * @param FileFilter $filter
     * @return Scanner[]
     */
    public static function getScanners($source, FileFilter $filter)
    {
        $localScanner = LocalScanner::create($source, $filter);
        if ($localScanner) {
            return [$localScanner];
        }

        return array_values(array_filter([
            FilesystemScanner::create($source, $filter),
            new ContainerScanner($source, $filter),
        ]));
    }

    /**
     * Search the files, whose name contains the query.
     *
     * @param string $query
     * @return array Sorted results as [filename, path]
     */
    public function search($query)
    {
        $generation = $this->cache->getGeneration($this->sourceId);

        $index = $this->getIndex($generation);
        if (is_array($index)) {
            $collector = new ResultCollector($query, $this->maxResults);
            foreach ($index as $entry) {
                $collector->add($entry[0], $entry[1]);
                if ($collector->isFull()) {
                    break;
                }
            }
            return $collector->getResults();
        }

        $cacheKey = $this->getCacheKey('results', [$generation, $query, $this->maxResults]);
        $results = $this->cache->get($cacheKey);
        if (!is_array($results)) {
            $collector = new ResultCollector($query, $this->maxResults);
            $this->scan($collector);
            $results = $collector->getResults();
            $this->cache->set($cacheKey, $results, self::RESULTS_LIFETIME);
        }
        return $results;
    }

    /**
     * Get the cached index of all files of the Media Source.
     *
     * @param string $generation
     * @return array|null Null, if the Media Source contains too many files
     */
    protected function getIndex($generation)
    {
        $cacheKey = $this->getCacheKey('index', [$generation]);
        $index = $this->cache->get($cacheKey);
        if ($index === self::INDEX_TOO_LARGE) {
            return null;
        }
        if (is_array($index)) {
            return $index;
        }

        // Collect one file more than the limit to detect a too large index
        $collector = new ResultCollector(null, self::INDEX_LIMIT + 1);
        $this->scan($collector);
        if ($collector->isFull()) {
            $this->cache->set($cacheKey, self::INDEX_TOO_LARGE, self::INDEX_LIFETIME);
            return null;
        }

        $index = $collector->getResults();
        $this->cache->set($cacheKey, $index, self::INDEX_LIFETIME);
        return $index;
    }

    /**
     * Scan the Media Source with the first working scanner and sort the results.
     *
     * @param ResultCollector $collector
     * @return void
     * @throws Throwable If the last scanner fails
     */
    protected function scan(ResultCollector $collector)
    {
        $lastScanner = end($this->scanners);
        foreach ($this->scanners as $scanner) {
            try {
                $scanner->scan($collector);
                break;
            } catch (Throwable $e) {
                if ($scanner === $lastScanner) {
                    throw $e;
                }
                if ($this->bettermediabrowser->getOption('debug')) {
                    $this->bettermediabrowser->modx->log(xPDO::LOG_LEVEL_ERROR, get_class($scanner) . ' failed for the media source ' . $this->sourceId . ': ' . $e->getMessage(), '', $this->bettermediabrowser->packageName);
                }
                $collector->reset();
            }
        }
        $collector->sort();
    }

    /**
     * The cache key depends on all values that change the file list.
     *
     * @param string $type
     * @param array $values Additional values
     * @return string
     */
    protected function getCacheKey($type, array $values)
    {
        return 'source_' . $this->sourceId . '_' . $type . '_' . md5(json_encode([
                $this->scanners[0]->getFingerprint(),
                $this->filter->getFingerprint(),
                $values,
            ]));
    }
}
