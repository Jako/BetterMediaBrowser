<?php
/**
 * Abstract scanner
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search\Scanners;

use modMediaSource;
use Visions\BetterMediaBrowser\Search\FileFilter;
use Visions\BetterMediaBrowser\Search\ResultCollector;
use Throwable;

/**
 * Class Scanner
 *
 * Scans all files of a Media Source recursively.
 */
abstract class Scanner
{
    const MAX_DEPTH = 64;

    /** @var modMediaSource|object */
    protected object $source;

    /** @var FileFilter */
    protected FileFilter $filter;

    /**
     * Scanner constructor
     *
     * @param modMediaSource|object $source An initialized Media Source
     * @param FileFilter $filter
     */
    public function __construct(object $source, FileFilter $filter)
    {
        $this->source = $source;
        $this->filter = $filter;
    }

    /**
     * Add the files of the Media Source to the collector, until it is full.
     *
     * @param ResultCollector $collector
     * @return void
     * @throws Throwable If the Media Source can't be scanned
     */
    abstract public function scan(ResultCollector $collector): void;

    /**
     * Scanner values that change the list of scanned files.
     *
     * @return array
     */
    public function getFingerprint(): array
    {
        // The stored Media Source properties (i.e. bucket, base path) change the scanned files
        return [static::class, get_class($this->source), $this->source->get('properties')];
    }
}
