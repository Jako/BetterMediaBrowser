<?php
/**
 * BetterMediaSource (MODX 2)
 *
 * @package bettermediabrowser
 * @subpackage model
 */

require_once dirname(__DIR__, 2) . '/vendor/autoload.php';

// Let xPDO load the parent class with the core sources package. Including the
// base class file directly causes a fatal error, when a modFileMediaSource
// object is created afterwards, because xPDO skips loading the database
// specific class, if the base class already exists. This file is included by
// xPDO::_loadClass(), so $this is the xPDO instance.
/** @var modX $xpdo */
$xpdo = (isset($this) && $this instanceof xPDO) ? $this : ($GLOBALS['modx'] ?? null);
if ($xpdo instanceof xPDO) {
    $xpdo->addPackage('sources', MODX_CORE_PATH . 'model/modx/');
    $xpdo->loadClass('sources.modFileMediaSource');
}

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
    public function moveObject($from, $to, $point = 'append'): bool
    {
        return $this->clearSearchCacheAfter(parent::moveObject($from, $to, $point));
    }

    /**
     * Clears the cache, because the permissions are shown in the folder lists.
     *
     * @param string $directoryPath
     * @param string $mode
     * @return bool
     */
    public function chmodContainer($directoryPath, $mode)
    {
        return $this->clearSearchCacheAfter(parent::chmodContainer($directoryPath, $mode));
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
