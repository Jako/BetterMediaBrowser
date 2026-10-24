<?php
/**
 * File filter
 *
 * @package bettermediabrowser
 * @subpackage search
 */

namespace Visions\BetterMediaBrowser\Search;

use modMediaSource;
use modX;

/**
 * Class FileFilter
 *
 * Applies the filters of the core getContainerList method (skipFiles,
 * allowedFileTypes, directory_list permission) and the excluded_folders
 * system setting.
 */
class FileFilter
{
    /** @var array */
    protected $skipFiles = [];

    /** @var array */
    protected $allowedExtensions = [];

    /** @var array */
    protected $excludedFolders = [];

    /** @var array */
    protected $excludedPatterns = [];

    /** @var bool */
    protected $canListDirectories = false;

    /** @var bool */
    protected $multibyte = false;

    /** @var string */
    protected $charset = 'UTF-8';

    /**
     * FileFilter constructor
     *
     * @param modX $modx
     * @param modMediaSource $source An initialized Media Source
     * @param array $excludedFolders Glob patterns of excluded folders
     */
    public function __construct($modx, $source, array $excludedFolders)
    {
        $this->excludedFolders = array_values(array_filter($excludedFolders, 'strlen'));
        foreach ($this->excludedFolders as $excludedFolder) {
            $pattern = self::globToRegex($excludedFolder, true);
            if ($pattern !== '') {
                $this->excludedPatterns[] = $pattern;
            }
        }

        $this->canListDirectories = $modx->hasPermission('directory_list');
        $this->multibyte = (bool)$modx->getOption('use_multibyte', null, false);
        $this->charset = $modx->getOption('modx_charset', null, 'UTF-8');

        $properties = $source->getPropertyList();

        $skipFiles = $source->getOption('skipFiles', $properties, '.svn,.git,_notes,nbproject,.idea,.DS_Store');
        if ($modx->getParser()) {
            $modx->parser->processElementTags('', $skipFiles, true, true);
        }
        $this->skipFiles = array_flip(array_filter(array_map('trim', explode(',', (string)$skipFiles)), 'strlen'));

        $allowedExtensions = $source->getOption('allowedFileTypes', $properties, '');
        if (!is_array($allowedExtensions)) {
            $allowedExtensions = ($allowedExtensions === '') ? [] : explode(',', (string)$allowedExtensions);
        }
        $this->allowedExtensions = array_flip(array_map('trim', $allowedExtensions));
    }

    /**
     * Can the user list (and descend into) directories?
     *
     * @return bool
     */
    public function canListDirectories()
    {
        return $this->canListDirectories;
    }

    /**
     * Is the entry skipped by the skipFiles Media Source property?
     *
     * @param string $name
     * @param string $relativePath
     * @param string $fullPath
     * @return bool
     */
    public function isSkipped($name, $relativePath, $fullPath = '')
    {
        return isset($this->skipFiles[$name])
            || isset($this->skipFiles[$relativePath])
            || ($fullPath !== '' && isset($this->skipFiles[$fullPath]));
    }

    /**
     * Is the file extension allowed by the allowedFileTypes property?
     *
     * @param string $name
     * @return bool
     */
    public function isAllowedExtension($name)
    {
        if (empty($this->allowedExtensions)) {
            return true;
        }
        $ext = pathinfo($name, PATHINFO_EXTENSION);
        $ext = $this->multibyte ? mb_strtolower($ext, $this->charset) : strtolower($ext);
        return isset($this->allowedExtensions[$ext]);
    }

    /**
     * Is the directory excluded by the excluded_folders system setting?
     *
     * @param string $path Directory path with trailing slash
     * @return bool
     */
    public function isExcluded($path)
    {
        foreach ($this->excludedPatterns as $excludedPattern) {
            if (preg_match($excludedPattern, $path)) {
                return true;
            }
        }
        return false;
    }

    /**
     * All filter values that change the list of scanned files.
     *
     * @return array
     */
    public function getFingerprint()
    {
        return [
            array_keys($this->allowedExtensions),
            array_keys($this->skipFiles),
            $this->excludedFolders,
            $this->canListDirectories,
        ];
    }

    /**
     * Convert a glob pattern to a regular expression, that matches a path
     * anchored at the Media Source root.
     * (Initial version from https://stackoverflow.com/a/13914119)
     *
     * `*` and `?` stay inside a single path segment, `**` spans multiple
     * segments, so a pattern starting with `**` and a slash matches at any
     * depth. A pattern without a trailing slash is treated as a folder.
     *
     * @param string $pattern
     * @param bool $ignoreCase
     * @return string Empty for an empty pattern
     */
    public static function globToRegex($pattern, $ignoreCase = false)
    {
        $pattern = ltrim(str_replace('\\', '/', trim($pattern)), '/');
        if ($pattern === '') {
            return '';
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

        return '#^' . $expr . '$#' . ($ignoreCase ? 'i' : '');
    }
}
