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
    protected ?string $query;

    /** @var int */
    protected int $limit;

    /** @var bool */
    protected bool $multibyte;

    /** @var array */
    protected array $results = [];

    /**
     * ResultCollector constructor
     *
     * @param string|null $query Null collects all files
     * @param int $limit
     */
    public function __construct(?string $query, int $limit)
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
    public function add(string $filename, string $relativePath): void
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
    public function isFull(): bool
    {
        return count($this->results) >= $this->limit;
    }

    /**
     * @return array
     */
    public function getResults(): array
    {
        return $this->results;
    }

    /**
     * Remove all collected results.
     *
     * @return void
     */
    public function reset(): void
    {
        $this->results = [];
    }

    /**
     * Sort the results by path.
     *
     * @return void
     */
    public function sort(): void
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
    protected function matches(string $filename): bool
    {
        if ($this->multibyte) {
            return mb_stripos($filename, $this->query, 0, 'UTF-8') !== false;
        }
        return stripos($filename, $this->query) !== false;
    }
}
