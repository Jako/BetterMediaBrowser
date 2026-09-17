## Install from MODX Extras

Search for BetterMediaBrowser in the Package Manager of your MODX installation
and install it in there.

## Manual installation

If you can't access the MODX Extras Repository in your MODX installation, you
can manually install BetterMediaBrowser.

* Download the transport package from [MODX Extras](https://modx.com/extras/package/bettermediabrowser) (or one of the pre-built transport packages in [_packages](https://github.com/Jako/AnchorsAway/tree/master/_packages))
* Upload the zip file to your MODX installation's `core/packages` folder or upload it manually in the MODX Package Manager.
* In the MODX Manager, navigate to the Package Manager page, and select 'Search locally for packages' from the dropdown button.
* BetterMediaBrowser should now show up in the list of available packages. Click the corresponding 'Install' button and follow the instructions to complete the installation.

## Build it from source

To build and install the package from source, use the `build.transport.php` PHP
script in the `_build` folder. Before using it, copy the
`build.config.sample.php` file in the `_build` folder to `build.config.php` and
change the path to the core folder of an existing MODX installation. To debug
the package in this existing MODX installation, install the package there using
the `build.bootstrap.php` PHP script in the `_build` folder.
