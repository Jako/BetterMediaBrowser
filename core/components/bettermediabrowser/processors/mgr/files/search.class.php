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
use Visions\BetterMediaBrowser\Search\FileFilter;
use Visions\BetterMediaBrowser\Search\FileSearch;
use Visions\BetterMediaBrowser\Search\Path;

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

    /** @var FileSearch */
    protected $search;

    /** @var array Extensions of the images, that get a thumbnail, as keys */
    protected $thumbnailExtensions = [];

    /** @var int Output buffer level before the processor started its buffer */
    protected $outputLevel = 0;

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
        if (!$this->bettermediabrowser->getOption('enabled') || !$this->bettermediabrowser->getOption('search_enabled')) {
            return $this->modx->lexicon('bettermediabrowser.error_search_disabled');
        }

        register_shutdown_function([$this, 'shutdown']);
        // Buffer the output, so that a displayed PHP error can be discarded on shutdown
        $this->outputLevel = ob_get_level();
        ob_start();

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

        $this->thumbnailExtensions = $this->getThumbnailExtensions();

        $filter = new FileFilter($this->modx, $this->source, (array)$this->bettermediabrowser->getOption('excluded_folders'));
        $this->search = new FileSearch($this->bettermediabrowser, $this->source, $filter, $this->maxResults);

        return true;
    }

    /**
     * @return string
     */
    public function process()
    {
        if (!$this->isSearchable() || !$this->search) {
            return $this->outputArray([], 0);
        }

        $results = $this->search->search($this->query);

        $start = max(0, (int)$this->getProperty('start', 0));
        $limit = (int)$this->getProperty('limit', self::PAGE_LIMIT);
        if ($limit < 1) {
            $limit = self::PAGE_LIMIT;
        }
        $limit = min($limit, self::PAGE_LIMIT_MAX);

        $list = [];
        foreach (array_slice($results, $start, $limit) as $result) {
            $list[] = $this->formatResult($result);
        }

        return $this->outputArray($list, count($results));
    }

    /**
     * Expand a compact search result to the result row.
     *
     * @param array $result [filename, path]
     * @return array
     */
    protected function formatResult(array $result)
    {
        $extension = strtolower(pathinfo($result[0], PATHINFO_EXTENSION));
        return [
            'filename' => $result[0],
            'extension' => $extension,
            'image' => isset($this->thumbnailExtensions[$extension]),
            'path' => $result[1],
            'baseurl' => $result[1],
            'directory' => Path::parent($result[1]),
            'source' => (int)$this->source->get('id'),
        ];
    }

    /**
     * Get the image extensions of the Media Source, that phpThumb can render.
     *
     * @return array Extensions as keys
     */
    protected function getThumbnailExtensions()
    {
        $imageExtensions = $this->source->getOption('imageExtensions', $this->source->getPropertyList(), 'jpg,jpeg,png,gif,svg,webp');
        $extensions = array_filter(array_map('trim', explode(',', strtolower($imageExtensions))), 'strlen');
        // phpThumb can't create a thumbnail of a vector image
        $extensions = array_diff($extensions, ['svg']);
        return array_flip($extensions);
    }

    /**
     * Is the query long enough to start a search?
     *
     * @return bool
     */
    protected function isSearchable()
    {
        $length = function_exists('mb_strlen') ? mb_strlen($this->query, 'UTF-8') : strlen($this->query);
        return $length >= $this->minLength;
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
     * Respond with a JSON error message after a fatal error (i.e. reaching
     * the maximum execution time) instead of a blank or invalid response.
     *
     * The PHP error message is only returned in debug mode for security
     * reasons. The script is not terminated with exit, so that the other
     * shutdown functions still run.
     */
    public function shutdown()
    {
        $error = error_get_last();
        $fatalErrors = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
        if (!is_array($error) || !isset($error['type']) || !in_array($error['type'], $fatalErrors, true)) {
            return;
        }

        // Discard the partial output (i.e. a displayed PHP error), so that the response is valid JSON
        while (ob_get_level() > $this->outputLevel && @ob_end_clean()) {
        }

        $message = (isset($error['message'])) ? $error['message'] : 'Unknown Error!';
        $debug = $this->bettermediabrowser->getOption('debug');
        if ($debug) {
            $this->modx->log(xPDO::LOG_LEVEL_ERROR, 'Script terminated with the error ' . $message, '', $this->bettermediabrowser->packageName);
        } elseif (strpos($message, 'Maximum execution time') === 0) {
            $message = $this->modx->lexicon('bettermediabrowser.error_search_timeout');
        } else {
            $message = $this->modx->lexicon('bettermediabrowser.error_search');
        }

        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo json_encode([
            'success' => false,
            'message' => $message,
        ]);
    }
}

return 'BetterMediaBrowserFilesSearchProcessor';
