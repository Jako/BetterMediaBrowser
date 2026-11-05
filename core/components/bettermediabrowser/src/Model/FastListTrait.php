<?php
/**
 * Faster folder lists of BetterMediaSource (MODX 3)
 *
 * @package bettermediabrowser
 * @subpackage model
 */

namespace Visions\BetterMediaBrowser\Model;

use MODX\Revolution\modUser;
use MODX\Revolution\modX;
use Throwable;
use xPDO\xPDO;

/**
 * Trait FastListTrait
 *
 * Avoids repeated and unnecessary work, that the MODX 3 media source does
 * for each file, while it builds the folder lists of the media browser:
 *
 * - getImageDimensions reads the whole file before it calls getimagesize
 *   and is called up to three times per image.
 * - The MIME type detection (finfo) runs up to three times per file, in
 *   isFileBinary, isFileImage and getVisibility.
 * - getBasePath and getBaseUrl prepare all media source properties
 *   (including the lexicon of the property descriptions) on each call.
 * - checkPolicy evaluates the media source policies up to five times per file.
 *
 * The lists are the same as the lists of the file system media source. Only
 * a text file with the extension of a binary image (i.e. a text file named
 * image.jpg) is not offered for editing anymore.
 *
 * Only for the MODX 3 class, the MODX 2 file system media source has none of
 * these issues.
 */
trait FastListTrait
{
    /**
     * Extensions of binary image formats, that are never edited as text.
     *
     * @var array
     */
    protected static array $binaryImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'ico'];

    /** @var array Base path and URL of the media source */
    protected array $fastListBases = [];

    /** @var array Image dimensions by path and extension */
    protected array $fastListDimensions = [];

    /** @var array Policy check results by criteria */
    protected array $fastListPolicies = [];

    /**
     * @return bool
     */
    public function initialize()
    {
        $this->resetFastList();
        return parent::initialize();
    }

    /**
     * @param array|string $properties
     * @param bool $merge
     * @return bool
     */
    public function setProperties($properties, $merge = false)
    {
        $this->resetFastList();
        return parent::setProperties($properties, $merge);
    }

    /**
     * Reset the remembered values, if the properties are set directly.
     *
     * @param string $k
     * @param mixed $v
     * @param string|callable $vType
     * @return bool
     */
    public function set($k, $v = null, $vType = '')
    {
        if ($k === 'properties') {
            $this->resetFastList();
        }
        return parent::set($k, $v, $vType);
    }

    /**
     * The base path is the same for all objects of the media source.
     *
     * @param string $object
     * @return string
     */
    public function getBasePath($object = '')
    {
        if (!array_key_exists('path', $this->fastListBases)) {
            $this->fastListBases['path'] = parent::getBasePath();
        }
        return $this->fastListBases['path'];
    }

    /**
     * The base URL is the same for all objects of the media source.
     *
     * @param string $object
     * @return string
     */
    public function getBaseUrl($object = '')
    {
        if (!array_key_exists('url', $this->fastListBases)) {
            $this->fastListBases['url'] = parent::getBaseUrl();
        }
        return $this->fastListBases['url'];
    }

    /**
     * Remember the policy checks of the current user.
     *
     * @param mixed $criteria
     * @param mixed $targets
     * @param modUser|null $user
     * @return bool
     */
    public function checkPolicy($criteria, $targets = null, ?modUser $user = null)
    {
        if ($targets !== null || $user !== null || !is_scalar($criteria)) {
            return parent::checkPolicy($criteria, $targets, $user);
        }
        $key = (string)$criteria;
        if (!array_key_exists($key, $this->fastListPolicies)) {
            $this->fastListPolicies[$key] = parent::checkPolicy($criteria);
        }
        return $this->fastListPolicies[$key];
    }

    /**
     * Use the file system to tell a folder from a file instead of the MIME
     * type detection.
     *
     * @param string $path
     * @return bool|string
     */
    public function getVisibility($path)
    {
        $path = $this->sanitizePath($path);
        $fullPath = $this->getBasePath() . $path;
        $isDirectory = is_dir($fullPath);
        if (!$isDirectory && !is_readable($fullPath)) {
            // Same error as the core method, whose MIME type detection fails for an unreadable file
            $this->addError('path', $this->xpdo->lexicon('file_err_nf'));
            $this->xpdo->log(xPDO::LOG_LEVEL_ERROR, 'Unable to retrieve the visibility of ' . $path);
            return false;
        }
        if (($isDirectory && $this->visibility_dirs) || (!$isDirectory && $this->visibility_files)) {
            try {
                return $this->filesystem->visibility($path);
            } catch (Throwable $e) {
                $this->addError('path', $this->xpdo->lexicon('file_err_nf'));
                $this->xpdo->log(xPDO::LOG_LEVEL_ERROR, $e->getMessage());
            }
        }
        return false;
    }

    /**
     * Read the image dimensions without reading the whole file and only once
     * per image.
     *
     * @param string $path
     * @param string $ext
     * @return array|bool
     */
    protected function getImageDimensions($path, $ext)
    {
        $key = $path . '|' . $ext;
        if (!array_key_exists($key, $this->fastListDimensions)) {
            if ($ext === 'svg') {
                $dimensions = parent::getImageDimensions($path, $ext);
            } else {
                // An unreadable file is reported by getVisibility, like in the core method
                $file = $this->getBasePath() . $path;
                $size = (is_file($file) && is_readable($file)) ? @getimagesize($file) : false;
                $dimensions = is_array($size) ? [
                    'width' => $size[0],
                    'height' => $size[1],
                ] : false;
            }
            $this->fastListDimensions[$key] = $dimensions;
        }
        return $this->fastListDimensions[$key];
    }

    /**
     * Detect the MIME type only for files without an image extension.
     *
     * @param string $file
     * @param array $image_extensions
     * @return bool
     */
    protected function isFileImage($file, $image_extensions = [])
    {
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (in_array($ext, array_map('strtolower', $image_extensions), true)) {
            return true;
        }
        return parent::isFileImage($file, $image_extensions);
    }

    /**
     * Binary image formats are never edited as text.
     *
     * @param string $file
     * @return bool
     */
    protected function isFileBinary($file)
    {
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (in_array($ext, static::$binaryImageExtensions, true)) {
            return true;
        }
        return parent::isFileBinary($file);
    }

    /**
     * @return void
     */
    protected function resetFastList(): void
    {
        $this->fastListBases = [];
        $this->fastListDimensions = [];
        $this->fastListPolicies = [];
    }
}
