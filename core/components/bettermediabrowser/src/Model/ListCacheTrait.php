<?php
/**
 * Media browser list cache of BetterMediaSource
 *
 * @package bettermediabrowser
 * @subpackage model
 */

namespace Visions\BetterMediaBrowser\Model;

/**
 * Trait ListCacheTrait
 *
 * Caches the folder lists of the media browser tree (getContainerList) and
 * view (getObjectsInContainer). Building a list reads the image sizes and
 * builds the preview URLs and context menus of all files, which takes about
 * half a second for a folder with a few hundred images.
 *
 * The cache key contains everything the list depends on:
 * - the cache generation of the media source, that changes with every file
 *   change in MODX (SearchCacheTrait, plugin events, clearing the MODX cache)
 * - the modification time of the folder, that changes, when a file is added,
 *   removed or renamed outside of MODX
 * - the user (permissions in the context menus), the context, the manager
 *   language and the media source properties
 *
 * A file, whose content is replaced outside of MODX, is shown with its old
 * size and image dimensions until the cache lifetime ends.
 *
 * Requires SearchCacheTrait for getBetterMediaBrowser().
 */
trait ListCacheTrait
{
    /**
     * Folders with more entries are not cached, to keep the cache entries small.
     *
     * @var int
     */
    protected static $listCacheMaxEntries = 2000;

    /**
     * @param string $path
     * @return array
     */
    public function getContainerList($path)
    {
        $cacheKey = $this->getListCacheKey('tree', $path);
        $list = $this->getListCache($cacheKey);
        if ($list === null) {
            $list = parent::getContainerList($path);
            $this->setListCache($cacheKey, $list);
        }
        return $list;
    }

    /**
     * @param string $path
     * @return array
     */
    public function getObjectsInContainer($path)
    {
        $cacheKey = $this->getListCacheKey('view', $path);
        $list = $this->getListCache($cacheKey);
        if ($list === null) {
            $list = parent::getObjectsInContainer($path);
            $this->setListCache($cacheKey, $list);
        }
        return $list;
    }

    /**
     * Get the cache key of a folder list.
     *
     * @param string $type
     * @param string $path
     * @return string|null Null, if the list can't be cached
     */
    protected function getListCacheKey($type, $path)
    {
        $bettermediabrowser = $this->getBetterMediaBrowser();
        if (!$bettermediabrowser || $this->getListCacheLifetime() <= 0) {
            return null;
        }

        $folderTime = $this->getListFolderTime($path);
        if ($folderTime === null) {
            // Let the media source report a missing or invalid folder
            return null;
        }
        if ($folderTime >= time() - 2) {
            // The modification time has a resolution of one second, so a change
            // in the same second would not change the cache key
            return null;
        }

        $sourceId = (int)$this->get('id');
        return 'source_' . $sourceId . '_list_' . md5(json_encode([
                $type,
                (string)$path,
                $folderTime,
                $bettermediabrowser->getSearchCache()->getGeneration($sourceId),
                $this->xpdo->user ? (int)$this->xpdo->user->get('id') : 0,
                $this->ctx ? $this->ctx->get('key') : '',
                $this->xpdo->getOption('manager_language'),
                $this->getPropertyList(),
            ]));
    }

    /**
     * @param string|null $cacheKey
     * @return array|null Null on a cache miss
     */
    protected function getListCache($cacheKey)
    {
        if ($cacheKey === null) {
            return null;
        }
        $list = $this->getBetterMediaBrowser()->getSearchCache()->get($cacheKey);
        return is_array($list) ? $list : null;
    }

    /**
     * Cache a folder list, if it was built without errors.
     *
     * @param string|null $cacheKey
     * @param mixed $list
     * @return void
     */
    protected function setListCache($cacheKey, $list)
    {
        if ($cacheKey === null || !is_array($list) || count($list) > static::$listCacheMaxEntries) {
            return;
        }
        $errors = $this->getErrors();
        if (!empty($errors)) {
            return;
        }
        $this->getBetterMediaBrowser()->getSearchCache()->set($cacheKey, $list, $this->getListCacheLifetime());
    }

    /**
     * @return int Lifetime in seconds, 0 disables the cache
     */
    protected function getListCacheLifetime()
    {
        $bettermediabrowser = $this->getBetterMediaBrowser();
        return $bettermediabrowser ? max(0, (int)$bettermediabrowser->getOption('list_cache_lifetime')) : 0;
    }

    /**
     * Get the modification time of a folder.
     *
     * @param string $path Folder path relative to the media source base path
     * @return int|null Null, if the path is not a folder
     */
    protected function getListFolderTime($path)
    {
        $basePath = rtrim(str_replace('\\', '/', (string)$this->getBasePath()), '/') . '/';
        foreach ([(string)$path, rawurldecode((string)$path)] as $candidate) {
            $candidate = trim(str_replace('\\', '/', $candidate), '/');
            if (strpos('/' . $candidate . '/', '/../') !== false) {
                return null;
            }
            $folder = $basePath . $candidate;
            if (is_dir($folder)) {
                clearstatcache(true, $folder);
                $time = @filemtime($folder);
                return ($time === false) ? null : $time;
            }
        }
        return null;
    }
}
