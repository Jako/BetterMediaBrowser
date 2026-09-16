<?php
/**
 * Abstract processor
 *
 * @package bettermediabrowser
 * @subpackage processors
 */

namespace Visions\BetterMediaBrowser\Processors;

use modProcessor;
use modX;
use Visions\BetterMediaBrowser\BetterMediaBrowser;

/**
 * Class Processor
 */
abstract class Processor extends modProcessor
{
    public $languageTopics = ['bettermediabrowser:default'];

    /** @var BetterMediaBrowser $bettermediabrowser */
    public $bettermediabrowser;

    /**
     * {@inheritDoc}
     * @param modX $modx A reference to the modX instance
     * @param array $properties An array of properties
     */
    public function __construct(modX &$modx, array $properties = [])
    {
        parent::__construct($modx, $properties);

        $corePath = $this->modx->getOption('bettermediabrowser.core_path', null, $this->modx->getOption('core_path') . 'components/bettermediabrowser/');
        $this->bettermediabrowser = $this->modx->getService('bettermediabrowser', BetterMediaBrowser::class, $corePath . 'model/bettermediabrowser/');
    }

    /**
     * {@inheritDoc}
     * @return bool
     */
    public function checkPermissions()
    {
        if ((!defined('MODX_REQP') || MODX_REQP !== false) && !empty($this->permission)) {
            if (is_array($this->permission)) {
                foreach ($this->permission as $permission) {
                    if ($this->modx->hasPermission($permission)) {
                        return true;
                    }
                }
                $this->permission = implode(', ', $this->permission);
                return false;
            } else {
                return $this->modx->hasPermission($this->permission);
            }
        }
        return true;
    }

    abstract public function process();

    /**
     * Get a boolean property.
     * @param string $k
     * @param mixed $default
     * @return bool
     */
    public function getBooleanProperty($k, $default = null)
    {
        return ($this->getProperty($k, $default) === 'true' || $this->getProperty($k, $default) === true || $this->getProperty($k, $default) === '1' || $this->getProperty($k, $default) === 1);
    }
}
