<?php
/**
 * BetterMediaSource (MODX 3)
 *
 * @package bettermediabrowser
 * @subpackage model
 */

namespace Visions\BetterMediaBrowser\Model;

use MODX\Revolution\Sources\modFileMediaSource;

/**
 * Class BetterMediaSource
 *
 * A file system media source. The folder lists of the media browser are
 * built faster (FastListTrait) and cached (ListCacheTrait).
 */
class BetterMediaSource extends modFileMediaSource
{
    use SearchCacheTrait;
    use ListCacheTrait;
    use FastListTrait;

    /**
     * Clears the search cache of both media sources, if a file is moved to another media source.
     *
     * @param string $from
     * @param string $to
     * @param string $point
     * @param int $to_source
     * @return bool
     */
    public function moveObject($from, $to, $point = 'append', $to_source = 0): bool
    {
        $result = parent::moveObject($from, $to, $point, $to_source);
        if ($result) {
            $this->clearSearchCache();
            if ($to_source && (int)$to_source !== (int)$this->get('id')) {
                $this->clearSearchCache((int)$to_source);
            }
        }
        return $result;
    }

    /**
     * Clears the cache, because the visibility is shown in the folder lists.
     *
     * @param string $path
     * @param string $visibility
     * @return bool
     */
    public function setVisibility($path, $visibility)
    {
        return $this->clearSearchCacheAfter(parent::setVisibility($path, $visibility));
    }

    /**
     * @return string
     */
    public function getTypeName(): string
    {
        $this->xpdo->lexicon->load('bettermediabrowser:default');
        return $this->xpdo->lexicon('bettermediabrowser.source_type');
    }

    /**
     * @return string
     */
    public function getTypeDescription(): string
    {
        $this->xpdo->lexicon->load('bettermediabrowser:default');
        return $this->xpdo->lexicon('bettermediabrowser.source_type_desc');
    }
}
