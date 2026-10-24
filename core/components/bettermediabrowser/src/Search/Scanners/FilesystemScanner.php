<?php
/**
 * Flysystem scanner
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search\Scanners;

use modMediaSource;
use Visions\BetterMediaBrowser\Search\FileFilter;
use Visions\BetterMediaBrowser\Search\Path;
use Visions\BetterMediaBrowser\Search\ResultCollector;

/**
 * Class FilesystemScanner
 *
 * Scans a MODX 3 Media Source with one deep listing. Remote sources (i.e. S3)
 * need one request per directory with the tree API, a deep listing needs
 * only one (paginated) request for the whole source. Excluded and skipped
 * directories can't be pruned in a deep listing, so each file is checked
 * against its parent directories.
 */
class FilesystemScanner extends Scanner
{
    /** @var \League\Flysystem\FilesystemOperator */
    protected $filesystem;

    /** @var array */
    protected $listableDirectories = [];

    /**
     * FilesystemScanner constructor
     *
     * @param modMediaSource $source
     * @param FileFilter $filter
     * @param \League\Flysystem\FilesystemOperator $filesystem
     */
    public function __construct($source, FileFilter $filter, $filesystem)
    {
        parent::__construct($source, $filter);
        $this->filesystem = $filesystem;
    }

    /**
     * Create the scanner, if the Media Source provides a Flysystem filesystem.
     *
     * @param modMediaSource $source
     * @param FileFilter $filter
     * @return self|null
     */
    public static function create($source, FileFilter $filter)
    {
        if (!method_exists($source, 'getFilesystem')) {
            return null;
        }
        $filesystem = $source->getFilesystem();
        if (!is_object($filesystem) || !method_exists($filesystem, 'listContents')) {
            return null;
        }
        return new self($source, $filter, $filesystem);
    }

    /**
     * @param ResultCollector $collector
     * @return void
     */
    public function scan(ResultCollector $collector)
    {
        foreach ($this->filesystem->listContents('', true) as $item) {
            if (!$item->isFile()) {
                continue;
            }

            $relativePath = ltrim(str_replace('\\', '/', $item->path()), '/');
            $directory = Path::parent($relativePath);
            if ($directory !== '' && !$this->isDirectoryListable($directory)) {
                continue;
            }

            $name = basename($relativePath);
            if ($this->filter->isSkipped($name, $relativePath) || !$this->filter->isAllowedExtension($name)) {
                continue;
            }

            $collector->add($name, $relativePath);
            if ($collector->isFull()) {
                return;
            }
        }
    }

    /**
     * Is a directory (and all its parents) visible in the Media Browser tree?
     *
     * @param string $directory Directory path with trailing slash
     * @return bool
     */
    protected function isDirectoryListable($directory)
    {
        if (!isset($this->listableDirectories[$directory])) {
            $parent = Path::parent($directory);
            $this->listableDirectories[$directory] = $this->filter->canListDirectories()
                && ($parent === '' || $this->isDirectoryListable($parent))
                && !$this->filter->isSkipped(basename($directory), rtrim($directory, '/'))
                && !$this->filter->isExcluded($directory);
        }
        return $this->listableDirectories[$directory];
    }
}
