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
 * A file system media source. The file search of BetterMediaBrowser scans
 * it directly in the file system, like the core file system media source.
 * The folder lists of the media browser are cached (ListCacheTrait).
 */
class BetterMediaSource extends modFileMediaSource
{
    use SearchCacheTrait;
    use ListCacheTrait;

    /**
     * Clears the search cache of both media sources, if a file is moved to another media source.
     *
     * @param string $from
     * @param string $to
     * @param string $point
     * @param int $to_source
     * @return bool
     */
    public function moveObject($from, $to, $point = 'append', $to_source = 0)
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
     * @return string
     */
    public function getTypeName()
    {
        $this->xpdo->lexicon->load('bettermediabrowser:default');
        return $this->xpdo->lexicon('bettermediabrowser.source_type');
    }

    /**
     * @return string
     */
    public function getTypeDescription()
    {
        $this->xpdo->lexicon->load('bettermediabrowser:default');
        return $this->xpdo->lexicon('bettermediabrowser.source_type_desc');
    }
}
