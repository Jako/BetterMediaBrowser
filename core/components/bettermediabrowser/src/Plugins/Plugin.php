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
    protected modX $modx;
    /** @var BetterMediaBrowser|null $bettermediabrowser */
    protected ?BetterMediaBrowser $bettermediabrowser = null;
    /** @var array $scriptProperties */
    protected array $scriptProperties;

    /**
     * Plugin constructor.
     *
     * @param modX $modx
     * @param array $scriptProperties
     */
    public function __construct(modX $modx, array &$scriptProperties)
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
     *
     * @return void
     */
    public function run(): void
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
    public function init(): bool
    {
        return true;
    }

    /**
     * Process the plugin event code.
     *
     * @return void
     */
    abstract public function process(): void;
}
