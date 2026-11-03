<?php
/**
 * BetterMediaSource (MODX 2)
 *
 * @package bettermediabrowser
 * @subpackage model
 */

require_once MODX_CORE_PATH . 'model/modx/sources/modmediasource.class.php';
require_once MODX_CORE_PATH . 'model/modx/sources/modfilemediasource.class.php';
require_once dirname(__DIR__, 2) . '/vendor/autoload.php';

use Visions\BetterMediaBrowser\Model\ListCacheTrait;
use Visions\BetterMediaBrowser\Model\SearchCacheTrait;

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
     * @param string $from
     * @param string $to
     * @param string $point
     * @return bool
     */
    public function moveObject($from, $to, $point = 'append')
    {
        return $this->clearSearchCacheAfter(parent::moveObject($from, $to, $point));
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
