<?php
/**
 * Media Source tree API scanner
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search\Scanners;

use Visions\BetterMediaBrowser\Search\Path;
use Visions\BetterMediaBrowser\Search\ResultCollector;

/**
 * Class ContainerScanner
 *
 * Scans any Media Source with the tree API (getContainerList), which applies
 * the Media Source filters itself. This is the slowest scanner, it is used
 * when no faster scanner is available.
 */
class ContainerScanner extends Scanner
{
    /**
     * @param ResultCollector $collector
     * @return void
     */
    public function scan(ResultCollector $collector)
    {
        $this->scanContainer($collector, '', 0);
    }

    /**
     * Scan a container recursively.
     *
     * @param ResultCollector $collector
     * @param string $path
     * @param int $depth
     * @return void
     */
    protected function scanContainer(ResultCollector $collector, $path, $depth)
    {
        if ($collector->isFull() || $depth > self::MAX_DEPTH) {
            return;
        }

        $path = Path::normalize($path, true);
        $entries = $this->source->getContainerList($path);
        if (!is_array($entries)) {
            return;
        }

        $directories = [];
        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            if ($this->isDirectory($entry)) {
                $directoryPath = $this->getEntryPath($entry);
                if ($this->isChildPath($directoryPath, $path) && !$this->filter->isExcluded($directoryPath)) {
                    $directories[$directoryPath] = $directoryPath;
                }
                continue;
            }

            $filename = $this->getEntryName($entry);
            $relativePath = $this->getEntryPath($entry);
            if ($filename !== '' && $relativePath !== '') {
                $collector->add($filename, $relativePath);
                if ($collector->isFull()) {
                    return;
                }
            }
        }

        foreach ($directories as $directoryPath) {
            $this->scanContainer($collector, $directoryPath, $depth + 1);
            if ($collector->isFull()) {
                return;
            }
        }
    }

    /**
     * Only descend into strict children of the current path, to avoid loops.
     *
     * @param string $path
     * @param string $parent
     * @return bool
     */
    protected function isChildPath($path, $parent)
    {
        if ($path === '' || $path === $parent) {
            return false;
        }
        return $parent === '' || strpos($path, $parent) === 0;
    }

    /**
     * Is the entry a directory?
     *
     * @param array $entry
     * @return bool
     */
    protected function isDirectory(array $entry)
    {
        $type = isset($entry['type']) ? strtolower((string)$entry['type']) : '';
        if (in_array($type, ['dir', 'directory', 'folder'], true)) {
            return true;
        }
        return isset($entry['leaf']) && in_array($entry['leaf'], [false, 0, '0'], true);
    }

    /**
     * Get the normalized path of an entry
     *
     * @param array $entry
     * @return string
     */
    protected function getEntryPath(array $entry)
    {
        $path = '';
        foreach (['pathRelative', 'path', 'id'] as $key) {
            if (isset($entry[$key]) && $entry[$key] !== '') {
                $path = $entry[$key];
                break;
            }
        }

        return Path::normalize($path, $this->isDirectory($entry));
    }

    /**
     * Get the name of an entry
     *
     * @param array $entry
     * @return string
     */
    protected function getEntryName(array $entry)
    {
        if (isset($entry['name']) && $entry['name'] !== '') {
            return (string)$entry['name'];
        }
        if (isset($entry['text']) && $entry['text'] !== '') {
            return trim(strip_tags((string)$entry['text']));
        }

        $path = $this->getEntryPath($entry);
        return $path === '' ? '' : basename(rtrim($path, '/'));
    }
}
