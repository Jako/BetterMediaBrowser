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
    /** @var modMediaSource */
    public $source;

    /** @var string */
    protected $query = '';

    /** @var int */
    protected $minLength = 2;

    /** @var int */
    protected $maxResults = 500;

    /** @var array */
    protected $results = [];

    /** @var array */
    protected $visited = [];

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
        $this->query = trim(str_replace(['../', './', '/'], '', strip_tags((string)$this->getProperty('query', ''))));

        $this->minLength = $this->bettermediabrowser->getOption('search_min_length');
        if ($this->minLength < 1) {
            $this->minLength = 1;
        }

        $this->maxResults = $this->bettermediabrowser->getOption('search_max_results');
        if ($this->maxResults < 1) {
            $this->maxResults = 500;
        }
        if ($this->maxResults > 5000) {
            $this->maxResults = 5000;
        }

        // Empty/too-short queries simply return an empty result set. This keeps
        // initial grid loading cheap and avoids scanning the whole source by accident.
        if ($this->stringLength($this->query) < $this->minLength) {
            return true;
        }

        if (!$this->getSource()) {
            return $this->modx->lexicon('permission_denied');
        }

        $properties = $this->getProperties();
        $properties['hideFiles'] = false;
        // MODX 2 provides its generated image preview URL inside qtip when
        // tooltips are enabled. Keeping them enabled lets us reuse the exact
        // Core preview URL instead of rebuilding phpthumb URLs ourselves.
        $properties['hideTooltips'] = true;

        // Do not overwrite the Media Source's own allow-list unless the browser
        // explicitly supplied allowedFileTypes.
        if (empty($properties['allowedFileTypes'])) {
            unset($properties['allowedFileTypes']);
        }

        $this->source->setRequestProperties($properties);
        if (!$this->source->initialize()) {
            return $this->modx->lexicon('permission_denied');
        }
        if (!$this->source->checkPolicy('list')) {
            return $this->modx->lexicon('permission_denied');
        }

        return true;
    }

    /**
     * @return string
     */
    public function process()
    {
        if ($this->stringLength($this->query) < $this->minLength || !$this->source) {
            return $this->outputArray([], 0);
        }

        $cacheManager = $this->modx->getCacheManager();
        $this->results = $cacheManager->get('source_' . $this->query . '_' . $this->source->get('id'), $this->bettermediabrowser->cacheOptions);
        if (!$this->results) {
            $this->results = [];
            $this->scanContainer('', 0);
            usort($this->results, [$this, 'sortResults']);
            $cacheManager->set('source_' . $this->query . '_' . $this->source->get('id'), $this->results, 60, $this->bettermediabrowser->cacheOptions);
        }

        $total = count($this->results);
        $start = max(0, (int)$this->getProperty('start', 0));
        $limit = (int)$this->getProperty('limit', 20);
        if ($limit < 1) {
            $limit = 20;
        }
        if ($limit > 100) {
            $limit = 100;
        }

        return $this->outputArray(array_slice($this->results, $start, $limit), $total);
    }

    /**
     * Resolve the current Media Source from the request rather than from a fixed setting.
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
     * Traverse the source using the Media Source API only. No direct filesystem
     * functions are used, so File/S3/custom sources can provide their own listing.
     *
     * @param string $path
     * @param int $depth
     * @return void
     */
    protected function scanContainer($path, $depth)
    {
        if (count($this->results) >= $this->maxResults || $depth > 64) {
            return;
        }

        $path = $this->normalizePath($path, true);
        $visitKey = $path === '' ? '/' : $path;
        if (isset($this->visited[$visitKey])) {
            return;
        }
        $this->visited[$visitKey] = true;

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
                foreach ($this->bettermediabrowser->getOption('excluded_folders') as $excludeFolder) {
                    if ($this->pathMatches($directoryPath, $excludeFolder, true)) {
                        continue 2;
                    }
                }
                if ($directoryPath !== '') {
                    $directories[] = $directoryPath;
                }
                continue;
            }

            $filename = $this->getEntryName($entry);
            if ($filename === '' || !$this->contains($filename, $this->query)) {
                continue;
            }

            $relativePath = $this->getEntryPath($entry);
            if ($relativePath === '') {
                continue;
            }

            $directory = $this->parentPath($relativePath);
            $objectUrl = $this->resolveObjectUrl($entry, $relativePath);
            $thumb = $this->resolvePreviewUrl($entry, $relativePath, $objectUrl);

            $this->results[] = [
                'filename' => $filename,
                'path' => $relativePath,
                'baseurl' => $relativePath,
                'fullurl' => $objectUrl,
                'thumb' => $thumb,
                'directory' => $directory,
                'source' => (int)$this->source->get('id'),
            ];

            if (count($this->results) >= $this->maxResults) {
                break;
            }
        }

        if (count($this->results) >= $this->maxResults) {
            return;
        }

        foreach ($directories as $directoryPath) {
            $this->scanContainer($directoryPath, $depth + 1);
            if (count($this->results) >= $this->maxResults) {
                return;
            }
        }
    }

    /**
     * Resolve the URL used when the file itself is opened. Media Source drivers
     * expose slightly different keys between MODX 2, MODX 3 and custom sources.
     *
     * @param array $entry
     * @param string $relativePath
     * @return string
     */
    protected function resolveObjectUrl(array $entry, $relativePath)
    {
        $keys = ['urlAbsolute', 'fullRelativeUrl', 'relativeUrl', 'urlExternal', 'url'];
        foreach ($keys as $key) {
            if (isset($entry[$key]) && $entry[$key] !== '') {
                return (string)$entry[$key];
            }
        }

        if (method_exists($this->source, 'getObjectUrl')) {
            return $this->source->getObjectUrl($relativePath);
        }

        return '';
    }

    /**
     * Resolve a preview URL without generating one ourselves. MODX 3 sources
     * commonly expose thumb/image directly; MODX 2's File Media Source embeds
     * the Core phpthumb URL in qtip. Reusing that URL preserves auth/source
     * parameters and custom Media Source behaviour.
     *
     * @param array $entry
     * @param string $relativePath
     * @param string $objectUrl
     * @return string
     */
    protected function resolvePreviewUrl(array $entry, $relativePath, $objectUrl)
    {
        $keys = ['thumb', 'thumbnail', 'image', 'previewUrl', 'preview_url'];
        foreach ($keys as $key) {
            if (isset($entry[$key]) && is_string($entry[$key]) && $entry[$key] !== '') {
                return $entry[$key];
            }
        }

        if (!empty($entry['qtip']) && is_string($entry['qtip'])) {
            if (preg_match('/<img\b[^>]*\bsrc=["\']([^"\']+)["\']/i', $entry['qtip'], $matches)) {
                return html_entity_decode($matches[1], ENT_QUOTES, 'UTF-8');
            }
        }

        // If the Media Source did not provide a dedicated thumbnail, the file
        // URL is still a valid preview for browser-displayable image formats.
        $ext = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));
        $imageExtensions = $this->source->getOption('imageExtensions', null, 'jpg,jpeg,png,gif,svg,webp');
        if (!is_array($imageExtensions)) {
            $imageExtensions = array_map('trim', explode(',', (string)$imageExtensions));
        }
        $imageExtensions = array_map('strtolower', $imageExtensions);
        if ($objectUrl !== '' && in_array($ext, $imageExtensions, true)) {
            return $objectUrl;
        }

        return '';
    }

    /**
     * @param array $entry
     * @return bool
     */
    protected function isDirectory(array $entry)
    {
        $type = isset($entry['type']) ? strtolower((string)$entry['type']) : '';
        if ($type === 'dir' || $type === 'directory' || $type === 'folder') {
            return true;
        }
        if (isset($entry['leaf']) && ($entry['leaf'] === false || $entry['leaf'] === 0 || $entry['leaf'] === '0')) {
            return true;
        }
        return false;
    }

    /**
     * @param array $entry
     * @return string
     */
    protected function getEntryPath(array $entry)
    {
        $path = '';
        if (isset($entry['pathRelative']) && $entry['pathRelative'] !== '') {
            $path = $entry['pathRelative'];
        } elseif (isset($entry['path']) && $entry['path'] !== '') {
            $path = $entry['path'];
        } elseif (isset($entry['id']) && $entry['id'] !== '') {
            $path = $entry['id'];
        }

        return $this->normalizePath($path, $this->isDirectory($entry));
    }

    /**
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
        $path = str_replace('\\', '/', $path);
        $path = str_replace("\0", '', $path);
        $path = preg_replace('#/+#', '/', $path);
        $path = ltrim($path, '/');

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
            $path = rtrim($path, '/') . '/';
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
        if ($pos === false) {
            return '';
        }
        return substr($path, 0, $pos + 1);
    }

    /**
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
     * Match a path with a glob pattern (https://stackoverflow.com/a/13914119)
     *
     * @param $path
     * @param $pattern
     * @param $ignoreCase
     * @return bool
     */
    protected function pathMatches($path, $pattern, $ignoreCase = FALSE)
    {
        $expr = preg_replace_callback('/[\\\\^$.[\\]|()?*+{}\\-\\/]/', function ($matches) {
            switch ($matches[0]) {
                case '*':
                    return '.*';
                case '?':
                    return '.';
                default:
                    return '\\' . $matches[0];
            }
        }, $pattern);

        $expr = '/' . $expr . '/';
        if ($ignoreCase) {
            $expr .= 'i';
        }

        return (bool)preg_match($expr, $path);
    }
}

return 'BetterMediaBrowserFilesSearchProcessor';
