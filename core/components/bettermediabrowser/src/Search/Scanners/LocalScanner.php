<?php
/**
 * Local file scanner
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search\Scanners;

use modMediaSource;
use Visions\BetterMediaBrowser\Search\FileFilter;
use Visions\BetterMediaBrowser\Search\ResultCollector;

/**
 * Class LocalScanner
 *
 * Scans a local file Media Source directly in the file system. The tree API
 * (getContainerList) builds a full tree node (menus, permission classes,
 * visibility etc.) for each entry, which is much slower.
 */
class LocalScanner extends Scanner
{
    /** @var string */
    protected $basePath;

    /** @var bool */
    protected $skipLinks;

    /** @var array */
    protected $visitedLinks = [];

    /**
     * LocalScanner constructor
     *
     * @param modMediaSource $source
     * @param FileFilter $filter
     * @param string $basePath Absolute base path with trailing slash
     */
    public function __construct($source, FileFilter $filter, $basePath)
    {
        parent::__construct($source, $filter);
        $this->basePath = $basePath;
        // The MODX 3 local Flysystem adapter skips links, MODX 2 follows them
        $this->skipLinks = class_exists('MODX\Revolution\Sources\modFileMediaSource');
    }

    /**
     * Create the scanner, if the Media Source is a local file Media Source.
     *
     * @param modMediaSource $source
     * @param FileFilter $filter
     * @return self|null
     */
    public static function create($source, FileFilter $filter)
    {
        if (!self::isLocalFileSource($source)) {
            return null;
        }

        $basePath = (string)$source->getBasePath();
        if ($basePath === '' || !is_dir($basePath)) {
            return null;
        }

        return new self($source, $filter, rtrim(str_replace('\\', '/', $basePath), '/') . '/');
    }

    /**
     * @param ResultCollector $collector
     * @return void
     */
    public function scan(ResultCollector $collector)
    {
        $this->visitedLinks = [];
        $this->scanDirectory($collector, '', 0);
    }

    /**
     * @return array
     */
    public function getFingerprint()
    {
        return [static::class, $this->basePath];
    }

    /**
     * Is the Media Source a local file Media Source?
     *
     * @param modMediaSource $source
     * @return bool
     */
    protected static function isLocalFileSource($source)
    {
        foreach (['MODX\Revolution\Sources\modFileMediaSource', 'modFileMediaSource'] as $class) {
            if (class_exists($class, false) && $source instanceof $class) {
                return true;
            }
        }
        return false;
    }

    /**
     * Scan a directory recursively.
     *
     * @param ResultCollector $collector
     * @param string $path Directory path relative to the base path (with trailing slash)
     * @param int $depth
     * @return void
     */
    protected function scanDirectory(ResultCollector $collector, $path, $depth)
    {
        if ($collector->isFull() || $depth > self::MAX_DEPTH) {
            return;
        }

        $fullPath = $this->basePath . $path;
        $names = @scandir($fullPath);
        if (!is_array($names)) {
            return;
        }
        // Same order as in the Media Browser tree
        sort($names, SORT_STRING | SORT_FLAG_CASE);

        $directories = [];
        foreach ($names as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }

            $relativePath = $path . $name;
            $filePathName = $fullPath . $name;
            if ($this->filter->isSkipped($name, $relativePath, $filePathName)) {
                continue;
            }
            if ($this->skipLinks && is_link($filePathName)) {
                continue;
            }
            if (!is_readable($filePathName)) {
                continue;
            }

            if (is_dir($filePathName)) {
                $directoryPath = $relativePath . '/';
                if ($this->filter->canListDirectories() && !$this->filter->isExcluded($directoryPath) && !$this->isLinkLoop($filePathName)) {
                    $directories[] = $directoryPath;
                }
                continue;
            }

            if (!$this->filter->isAllowedExtension($name)) {
                continue;
            }

            $collector->add($name, $relativePath);
            if ($collector->isFull()) {
                return;
            }
        }

        foreach ($directories as $directoryPath) {
            $this->scanDirectory($collector, $directoryPath, $depth + 1);
            if ($collector->isFull()) {
                return;
            }
        }
    }

    /**
     * Avoid endless loops caused by linked directories.
     *
     * @param string $filePathName
     * @return bool
     */
    protected function isLinkLoop($filePathName)
    {
        if (!is_link($filePathName)) {
            return false;
        }
        $target = realpath($filePathName);
        if ($target === false || isset($this->visitedLinks[$target])) {
            return true;
        }
        $parent = realpath(dirname($filePathName));
        if ($parent !== false && strpos($parent . '/', rtrim($target, '/') . '/') === 0) {
            return true;
        }
        $this->visitedLinks[$target] = true;
        return false;
    }
}
