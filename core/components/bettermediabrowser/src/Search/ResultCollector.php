<?php
/**
 * Result collector
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search;

/**
 * Class ResultCollector
 *
 * Collects the files whose name matches the query, up to a limit. Without a
 * query all files are collected. The results are stored compact as
 * [filename, path], to keep the cache entries small.
 */
class ResultCollector
{
    /** @var string|null */
    protected $query;

    /** @var int */
    protected $limit;

    /** @var bool */
    protected $multibyte;

    /** @var array */
    protected $results = [];

    /**
     * ResultCollector constructor
     *
     * @param string|null $query Null collects all files
     * @param int $limit
     */
    public function __construct($query, $limit)
    {
        $this->query = $query;
        $this->limit = $limit;
        $this->multibyte = function_exists('mb_stripos');
    }

    /**
     * Add a file, if its name matches the query.
     *
     * @param string $filename
     * @param string $relativePath Normalized path relative to the Media Source base path
     * @return void
     */
    public function add($filename, $relativePath)
    {
        if ($this->query !== null && !$this->matches($filename)) {
            return;
        }
        $this->results[] = [$filename, $relativePath];
    }

    /**
     * Is the limit reached?
     *
     * @return bool
     */
    public function isFull()
    {
        return count($this->results) >= $this->limit;
    }

    /**
     * @return array
     */
    public function getResults()
    {
        return $this->results;
    }

    /**
     * Remove all collected results.
     *
     * @return void
     */
    public function reset()
    {
        $this->results = [];
    }

    /**
     * Sort the results by path.
     *
     * @return void
     */
    public function sort()
    {
        usort($this->results, function ($a, $b) {
            return strcasecmp($a[1], $b[1]);
        });
    }

    /**
     * Does the filename contain the query (case-insensitive)?
     *
     * @param string $filename
     * @return bool
     */
    protected function matches($filename)
    {
        if ($this->multibyte) {
            return mb_stripos($filename, $this->query, 0, 'UTF-8') !== false;
        }
        return stripos($filename, $this->query) !== false;
    }
}
