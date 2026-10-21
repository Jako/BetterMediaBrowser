<?php

/**
 * Search files recursively inside the active MODX Media Source.
 *
 * The processor is intentionally read-only. It mirrors the relevant security
 * model of the core Browser/Directory/GetFiles processor:
 * - manager permission: file_list
 * - Media Source policy: list
 * - active Media Source is supplied dynamically by the Media Browser
 *
 * @package bettermediabrowser
 */

use Visions\BetterMediaBrowser\Processors\Processor;

class BetterMediaBrowserFilesSearchProcessor extends Processor
{
    const RESULTS_LIMIT = 500;
    const RESULTS_LIMIT_MAX = 5000;
    const PAGE_LIMIT = 20;
    const PAGE_LIMIT_MAX = 100;

    /** @var modMediaSource */
    public $source;

    /** @var string */
    protected $query = '';

    /** @var int */
    protected $minLength = 2;

    /** @var int */
    protected $maxResults = self::RESULTS_LIMIT;

    /** @var array */
    protected $excludedFolders = [];

    /** @var array */
    protected $imageExtensions = [];

    /** @var array */
    protected $results = [];

    /**
     * Same manager permission as the core file-listing processor.
     *
     * @return bool
     */
    public function checkPermissions()
    {
        return $this->modx->hasPermission('file_list');
    }

    /**
     * @return array
     */
    public function getLanguageTopics()
    {
        return ['file', 'source'];
    }

    /**
     * @return bool|string
     */
    public function initialize()
    {
        register_shutdown_function([$this, 'shutdown']);

        $this->query = trim(str_replace(['../', './', '/'], '', strip_tags((string)$this->getProperty('query', ''))));
        $this->minLength = max(2, (int)$this->bettermediabrowser->getOption('search_min_length'));

        $this->maxResults = (int)$this->bettermediabrowser->getOption('search_max_results');
        if ($this->maxResults < 1) {
            $this->maxResults = self::RESULTS_LIMIT;
        }
        $this->maxResults = min($this->maxResults, self::RESULTS_LIMIT_MAX);

        if (!$this->isSearchable()) {
            return true;
        }

        if (!$this->getSource()) {
            return $this->modx->lexicon('permission_denied');
        }

        $properties = $this->getProperties();
        $properties['hideFiles'] = false;
        // Avoid building image previews (image size, EXIF, phpThumb URLs) for each listed file
        $properties['hideTooltips'] = true;
        if (empty($properties['allowedFileTypes'])) {
            unset($properties['allowedFileTypes']);
        }

        $this->source->setRequestProperties($properties);
        if (!$this->source->initialize() || !$this->source->checkPolicy('list')) {
            return $this->modx->lexicon('permission_denied');
        }

        $this->excludedFolders = array_filter((array)$this->bettermediabrowser->getOption('excluded_folders'), 'strlen');
        $this->imageExtensions = $this->getImageExtensions();

        return true;
    }

    /**
     * @return string
     */
    public function process()
    {
        if (!$this->isSearchable() || !$this->source) {
            return $this->outputArray([], 0);
        }

        $cacheManager = $this->modx->getCacheManager();
        $cacheKey = $this->getCacheKey();
        $this->results = $cacheManager->get($cacheKey, $this->bettermediabrowser->cacheOptions);
        if (!is_array($this->results)) {
            $this->results = [];
            $this->scanContainer('', 0);
            usort($this->results, [$this, 'sortResults']);
            $cacheManager->set($cacheKey, $this->results, 60, $this->bettermediabrowser->cacheOptions);
        }

        $start = max(0, (int)$this->getProperty('start', 0));
        $limit = (int)$this->getProperty('limit', self::PAGE_LIMIT);
        if ($limit < 1) {
            $limit = self::PAGE_LIMIT;
        }
        $limit = min($limit, self::PAGE_LIMIT_MAX);

        return $this->outputArray(array_slice($this->results, $start, $limit), count($this->results));
    }

    /**
     * Is the query long enough to start a search?
     *
     * @return bool
     */
    protected function isSearchable()
    {
        return $this->stringLength($this->query) >= $this->minLength;
    }

    /**
     * The cache key depends on all request values that change the result list.
     *
     * @return string
     */
    protected function getCacheKey()
    {
        return 'source_' . $this->source->get('id') . '_' . md5(json_encode([
                $this->query,
                (string)$this->getProperty('allowedFileTypes', ''),
                $this->excludedFolders,
                $this->maxResults,
            ]));
    }

    /**
     * Resolve the current Media Source from the request.
     *
     * @return modMediaSource|bool
     */
    protected function getSource()
    {
        if (!class_exists('modMediaSource')) {
            $this->modx->loadClass('sources.modMediaSource');
        }

        $sourceId = $this->getProperty('source');
        if ($sourceId === null || $sourceId === '') {
            return false;
        }

        $this->source = modMediaSource::getDefaultSource($this->modx, $sourceId);
        if (empty($this->source) || !$this->source->getWorkingContext()) {
            $this->source = null;
            return false;
        }

        return $this->source;
    }

    /**
     * Get the lowercased image extensions of the Media Source.
     *
     * @return array
     */
    protected function getImageExtensions()
    {
        $imageExtensions = $this->source->getOption('imageExtensions', null, 'jpg,jpeg,png,gif,svg,webp');
        if (!is_array($imageExtensions)) {
            $imageExtensions = explode(',', (string)$imageExtensions);
        }
        return array_map('strtolower', array_map('trim', $imageExtensions));
    }

    /**
     * Is the maximum number of results reached?
     *
     * @return bool
     */
    protected function maxResultsReached()
    {
        return count($this->results) >= $this->maxResults;
    }

    /**
     * Scan a container of the source recursively using the Media Source API.
     *
     * @param string $path
     * @param int $depth
     * @return void
     */
    protected function scanContainer($path, $depth)
    {
        if ($this->maxResultsReached() || $depth > 64) {
            return;
        }

        $path = $this->normalizePath($path, true);
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
                if ($this->isChildPath($directoryPath, $path) && !$this->isExcluded($directoryPath)) {
                    $directories[$directoryPath] = $directoryPath;
                }
                continue;
            }

            $this->addResult($entry);
            if ($this->maxResultsReached()) {
                return;
            }
        }

        foreach ($directories as $directoryPath) {
            $this->scanContainer($directoryPath, $depth + 1);
            if ($this->maxResultsReached()) {
                return;
            }
        }
    }

    /**
     * Add a file entry to the results, if its name matches the query.
     *
     * @param array $entry
     * @return void
     */
    protected function addResult(array $entry)
    {
        $filename = $this->getEntryName($entry);
        if ($filename === '' || !$this->contains($filename, $this->query)) {
            return;
        }

        $relativePath = $this->getEntryPath($entry);
        if ($relativePath === '') {
            return;
        }

        $objectUrl = $this->resolveObjectUrl($entry, $relativePath);
        $this->results[] = [
            'filename' => $filename,
            'path' => $relativePath,
            'baseurl' => $relativePath,
            'directory' => $this->parentPath($relativePath),
            'source' => (int)$this->source->get('id'),
        ];
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
     * Is the directory excluded by the excluded_folders system setting?
     *
     * @param string $path
     * @return bool
     */
    protected function isExcluded($path)
    {
        foreach ($this->excludedFolders as $excludedFolder) {
            if ($this->pathMatches($path, $excludedFolder, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Resolve the URL used when the file itself is opened.
     *
     * @param array $entry
     * @param string $relativePath
     * @return string
     */
    protected function resolveObjectUrl(array $entry, $relativePath)
    {
        foreach (['urlAbsolute', 'fullRelativeUrl', 'relativeUrl', 'urlExternal', 'url'] as $key) {
            if (isset($entry[$key]) && $entry[$key] !== '') {
                return (string)$entry[$key];
            }
        }

        if (method_exists($this->source, 'getObjectUrl')) {
            return (string)$this->source->getObjectUrl($relativePath);
        }

        return '';
    }

    /**
     * Resolve the preview URL.
     *
     * Thumbnails or tooltip images provided by the Media Source are ignored on
     * purpose, because they usually point to the phpThumb connector and would
     * generate a thumbnail for each displayed search result. Browser-displayable
     * image formats are previewed by their file URL instead.
     *
     * @param string $relativePath
     * @param string $objectUrl
     * @return string
     */
    protected function resolvePreviewUrl($relativePath, $objectUrl)
    {
        $ext = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));
        if ($objectUrl !== '' && in_array($ext, $this->imageExtensions, true)) {
            return $objectUrl;
        }

        return '';
    }

    /**
     * Is the current entry a directory?
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
     * Get the path of an entry
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

        return $this->normalizePath($path, $this->isDirectory($entry));
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

    /**
     * Normalize a path
     *
     * @param mixed $path
     * @param bool $directory
     * @return string
     */
    protected function normalizePath($path, $directory = false)
    {
        $path = (string)$path;
        for ($i = 0; $i < 3; $i++) {
            $decoded = rawurldecode($path);
            if ($decoded === $path) {
                break;
            }
            $path = $decoded;
        }
        $path = str_replace(['\\', "\0"], ['/', ''], $path);

        $safe = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                return '';
            }
            $safe[] = $segment;
        }

        $path = implode('/', $safe);
        if ($directory && $path !== '') {
            $path .= '/';
        }
        return $path;
    }

    /**
     * @param string $path
     * @return string
     */
    protected function parentPath($path)
    {
        $path = rtrim($this->normalizePath($path), '/');
        $pos = strrpos($path, '/');
        return ($pos === false) ? '' : substr($path, 0, $pos + 1);
    }

    /**
     * stripos wrapper that uses the mb_stripos method when available
     *
     * @param string $haystack
     * @param string $needle
     * @return bool
     */
    protected function contains($haystack, $needle)
    {
        if (function_exists('mb_stripos')) {
            return mb_stripos($haystack, $needle, 0, 'UTF-8') !== false;
        }
        return stripos($haystack, $needle) !== false;
    }

    /**
     * strlen wrapper that uses the mb_strlen method when available
     *
     * @param string $value
     * @return int
     */
    protected function stringLength($value)
    {
        if (function_exists('mb_strlen')) {
            return (int)mb_strlen($value, 'UTF-8');
        }
        return strlen($value);
    }

    /**
     * Sort the result by baseurl
     *
     * @param array $a
     * @param array $b
     * @return int
     */
    protected function sortResults($a, $b)
    {
        $left = isset($a['baseurl']) ? $a['baseurl'] : '';
        $right = isset($b['baseurl']) ? $b['baseurl'] : '';
        return strcasecmp($left, $right);
    }

    /**
     * Match a path with a glob pattern, anchored at the Media Source root.
     * (Initial version from https://stackoverflow.com/a/13914119)
     *
     * `*` and `?` stay inside a single path segment, `**` spans multiple
     * segments, so a pattern starting with `**` and a slash matches at any
     * depth. A pattern without a trailing slash is treated as a folder.
     *
     * @param string $path
     * @param string $pattern
     * @param bool $ignoreCase
     * @return bool
     */
    protected function pathMatches($path, $pattern, $ignoreCase = false)
    {
        $pattern = ltrim(str_replace('\\', '/', trim($pattern)), '/');
        if ($pattern === '') {
            return false;
        }
        $pattern = rtrim($pattern, '/') . '/';

        $expr = preg_replace_callback('/\*\*\/|\*\*|\*|\?|[^*?]+/', function ($matches) {
            switch ($matches[0]) {
                case '**/':
                    return '(?:.*/)?';
                case '**':
                    return '.*';
                case '*':
                    return '[^/]*';
                case '?':
                    return '[^/]';
                default:
                    return preg_quote($matches[0], '#');
            }
        }, $pattern);

        $expr = '#^' . $expr . '$#' . ($ignoreCase ? 'i' : '');

        return (bool)preg_match($expr, $path);
    }

    /**
     * Display a shutdown message (i.e. in case of reaching the maximum
     * execution time) instead of just a blank result
     */
    public function shutdown()
    {
        $error = error_get_last();
        if (is_array($error) && isset($error['type']) && $error['type'] === E_ERROR) {
            $message = (isset($error['message'])) ? $error['message'] : 'Unknown Error!';
            if ($this->bettermediabrowser->getOption('debug')) {
                $this->modx->log(xPDO::LOG_LEVEL_ERROR, 'Script terminated with the error ' . $message, '', $this->modx->lexicon($this->bettermediabrowser->namespace));
            }
            exit(json_encode([
                'success' => false,
                'message' => $message,
            ]));
        }
    }
}

return 'BetterMediaBrowserFilesSearchProcessor';
