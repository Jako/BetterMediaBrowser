<?php
/**
 * Abstract plugin
 *
 * @package bettermediabrowser
 * @subpackage plugin
 */

namespace Visions\BetterMediaBrowser\Plugins;

use modX;
use Visions\BetterMediaBrowser\BetterMediaBrowser;

/**
 * Class Plugin
 */
abstract class Plugin
{
    /** @var modX $modx */
    protected $modx;
    /** @var BetterMediaBrowser $bettermediabrowser */
    protected $bettermediabrowser;
    /** @var array $scriptProperties */
    protected $scriptProperties;

    /**
     * Plugin constructor.
     *
     * @param $modx
     * @param $scriptProperties
     */
    public function __construct($modx, &$scriptProperties)
    {
        $this->scriptProperties = &$scriptProperties;
        $this->modx =& $modx;
        $corePath = $this->modx->getOption('bettermediabrowser.core_path', null, $this->modx->getOption('core_path') . 'components/bettermediabrowser/');
        $this->bettermediabrowser = $this->modx->getService('bettermediabrowser', BetterMediaBrowser::class, $corePath . 'model/bettermediabrowser/', [
            'core_path' => $corePath
        ]);
    }

    /**
     * Run the plugin event.
     */
    public function run()
    {
        $init = $this->init();
        if ($init !== true) {
            return;
        }

        $this->process();
    }

    /**
     * Initialize the plugin event.
     *
     * @return bool
     */
    public function init()
    {
        return true;
    }

    /**
     * Process the plugin event code.
     *
     * @return mixed
     */
    abstract public function process();
}
