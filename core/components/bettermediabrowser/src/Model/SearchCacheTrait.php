<?php
/**
 * Search cache handling of BetterMediaSource
 *
 * @package bettermediabrowser
 * @subpackage model
 */

namespace Visions\BetterMediaBrowser\Model;

/**
 * Trait SearchCacheTrait
 *
 * Clears the file search cache of the media source after each successful
 * file change, so that the cache stays valid, even if the file manager
 * events are not fired or the plugin is disabled. Used by the MODX 2 and
 * the MODX 3 class of BetterMediaSource, the method signatures are the same
 * in both versions. moveObject differs and is overridden in each class.
 */
trait SearchCacheTrait
{
    /**
     * Clear the search cache of a media source.
     *
     * @param int|null $sourceId Null clears the cache of this media source
     * @return void
     */
    protected function clearSearchCache($sourceId = null)
    {
        $bettermediabrowser = $this->getBetterMediaBrowser();
        if ($bettermediabrowser) {
            $bettermediabrowser->getSearchCache()->clear($sourceId !== null ? $sourceId : $this->get('id'));
        }
    }

    /**
     * Get the BetterMediaBrowser service.
     *
     * @return \Visions\BetterMediaBrowser\BetterMediaBrowser|null
     */
    protected function getBetterMediaBrowser()
    {
        $corePath = $this->xpdo->getOption('bettermediabrowser.core_path', null, $this->xpdo->getOption('core_path') . 'components/bettermediabrowser/');
        $bettermediabrowser = $this->xpdo->getService('bettermediabrowser', 'BetterMediaBrowser', $corePath . 'model/bettermediabrowser/', [
            'core_path' => $corePath
        ]);
        return $bettermediabrowser ?: null;
    }

    /**
     * Clear the search cache, if a file change was successful.
     *
     * @param mixed $result The result of the file change
     * @return mixed The unchanged result
     */
    protected function clearSearchCacheAfter($result)
    {
        if ($result) {
            $this->clearSearchCache();
        }
        return $result;
    }

    public function createObject($objectPath, $name, $content)
    {
        return $this->clearSearchCacheAfter(parent::createObject($objectPath, $name, $content));
    }

    public function removeObject($objectPath)
    {
        return $this->clearSearchCacheAfter(parent::removeObject($objectPath));
    }

    public function renameObject($oldPath, $newName)
    {
        return $this->clearSearchCacheAfter(parent::renameObject($oldPath, $newName));
    }

    public function removeContainer($path)
    {
        return $this->clearSearchCacheAfter(parent::removeContainer($path));
    }

    public function renameContainer($oldPath, $newName)
    {
        return $this->clearSearchCacheAfter(parent::renameContainer($oldPath, $newName));
    }

    public function uploadObjectsToContainer($container, array $objects = [])
    {
        return $this->clearSearchCacheAfter(parent::uploadObjectsToContainer($container, $objects));
    }
}
