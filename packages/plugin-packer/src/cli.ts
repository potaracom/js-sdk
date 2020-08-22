"use strict";

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'path'.
const path = require("path");
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'fs'.
const fs = require("fs");
const os = require("os");
const chokidar = require("chokidar");
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'denodeify'... Remove this comment to see the full error message
const denodeify = require("denodeify");

const writeFile = denodeify(fs.writeFile);
const mkdirp = require("mkdirp");
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'debug'.
const debug = require("debug")("cli");
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'validate'.
const validate = require("@kintone/plugin-manifest-validator");

// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'packer'.
const packer = require("./");
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'console'.
const console = require("./console");
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'generateEr... Remove this comment to see the full error message
const generateErrorMessages = require("./gen-error-msg");
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'createCont... Remove this comment to see the full error message
const createContentsZip = require("./create-contents-zip");

/**
 * @param {string} pluginDir path to plugin directory.
 * @param {Object=} options {ppk: string, out: string}.
 * @return {!Promise<string>} The resolved value is a path to the output plugin zip file.
 */
function cli(pluginDir: any, options_: any) {
  const options = options_ || {};
  const packerLocal = options.packerMock_ ? options.packerMock_ : packer;

  return Promise.resolve()
    .then(() => {
      // 1. check if pluginDir is a directory
      if (!fs.statSync(pluginDir).isDirectory()) {
        throw new Error(`${pluginDir} should be a directory.`);
      }

      // 2. check pluginDir/manifest.json
      const manifestJsonPath = path.join(pluginDir, "manifest.json");
      if (!fs.statSync(manifestJsonPath).isFile()) {
        throw new Error("Manifest file $PLUGIN_DIR/manifest.json not found.");
      }

      // 3. validate manifest.json
      const manifest = loadJson(manifestJsonPath);
      throwIfInvalidManifest(manifest, pluginDir);

      let outputDir = path.dirname(path.resolve(pluginDir));
      let outputFile = path.join(outputDir, "plugin.zip");
      if (options.out) {
        outputFile = options.out;
        outputDir = path.dirname(path.resolve(outputFile));
      }
      debug(`outputDir : ${outputDir}`);
      debug(`outputFile : ${outputFile}`);

      // 4. generate new ppk if not specified
      const ppkFile = options.ppk;
      let privateKey: any;
      if (ppkFile) {
        debug(`loading an existing key: ${ppkFile}`);
        privateKey = fs.readFileSync(ppkFile, "utf8");
      }

      // 5. package plugin.zip
      return Promise.all([
        mkdirp(outputDir),
        createContentsZip(pluginDir, manifest).then((contentsZip: any) => packerLocal(contentsZip, privateKey)
        ),
      ]).then((result) => {
        const output = result[1];
        const ppkFilePath = path.join(outputDir, `${output.id}.ppk`);
        if (!ppkFile) {
          fs.writeFileSync(ppkFilePath, output.privateKey, "utf8");
        }

        if (options.watch) {
          // change events are fired before chagned files are flushed on Windows,
          // which generate an invalid plugin zip.
          // in order to fix this, we use awaitWriteFinish option only on Windows.
          const watchOptions =
            os.platform() === "win32"
              ? {
                  awaitWriteFinish: {
                    stabilityThreshold: 1000,
                    pollInterval: 250,
                  },
                }
              : {};
          const watcher = chokidar.watch(pluginDir, watchOptions);
          watcher.on("change", () => {
            cli(
              pluginDir,
              Object.assign({}, options, {
                watch: false,
                ppk: options.ppk || ppkFilePath,
              })
            );
          });
        }
        return outputPlugin(outputFile, output.plugin);
      });
    })
    .then((outputFile) => {
      console.log("Succeeded:", outputFile);
      return outputFile;
    })
    .catch((error) => {
      console.error("Failed:", error.message);
      return Promise.reject(error);
    });
}

module.exports = cli;

/**
 * @param {!Object} manifest
 * @param {string} pluginDir
 */
function throwIfInvalidManifest(manifest: any, pluginDir: any) {
  const result = validate(manifest, {
    relativePath: validateRelativePath(pluginDir),
    maxFileSize: validateMaxFileSize(pluginDir),
  });
  debug(result);

  if (!result.valid) {
    const msgs = generateErrorMessages(result.errors);
    console.error("Invalid manifest.json:");
    msgs.forEach((msg: any) => {
      console.error(`- ${msg}`);
    });
    throw new Error("Invalid manifest.json");
  }
}

/**
 * Create and save plugin.zip
 *
 * @param {string} outputPath
 * @param {!Buffer} plugin
 * @return {!Promise<string>} The value is output path of plugin.zip.
 */
function outputPlugin(outputPath: any, plugin: any) {
  return writeFile(outputPath, plugin).then((arg: any) => outputPath);
}

/**
 * Load JSON file without caching
 *
 * @param {string} jsonPath
 * @return {Object}
 */
function loadJson(jsonPath: any) {
  const content = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(content);
}

/**
 * Return validator for `relative-path` format
 *
 * @param {string} pluginDir
 * @return {function(string): boolean}
 */
function validateRelativePath(pluginDir: any) {
  return (str: any) => {
    try {
      const stat = fs.statSync(path.join(pluginDir, str));
      return stat.isFile();
    } catch (e) {
      return false;
    }
  };
}

/**
 * Return validator for `maxFileSize` keyword
 *
 * @param {string} pluginDir
 * @return {function(number, string): boolean}
 */
function validateMaxFileSize(pluginDir: any) {
  return (maxBytes: any, filePath: any) => {
    try {
      const stat = fs.statSync(path.join(pluginDir, filePath));
      return stat.size <= maxBytes;
    } catch (e) {
      return false;
    }
  };
}