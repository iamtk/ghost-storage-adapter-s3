'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

var _path = require('path');

var _fs = require('fs');

var _imageTransform = require('@tryghost/image-transform');

var _imageTransform2 = _interopRequireDefault(_imageTransform);

var mime = require('mime');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var LocalStorage = require((0, _path.join)(process.cwd(), 'current/core/server/adapters/storage/LocalStorageBase'));

var readFileAsync = function readFileAsync(fp) {
  return new Promise(function (resolve, reject) {
    return (0, _fs.readFile)(fp, function (err, data) {
      return err ? reject(err) : resolve(data);
    });
  });
};
var stripLeadingSlash = function stripLeadingSlash(s) {
  return s.indexOf('/') === 0 ? s.substring(1) : s;
};
var stripEndingSlash = function stripEndingSlash(s) {
  return s.indexOf('/') === s.length - 1 ? s.substring(0, s.length - 1) : s;
};

class Store extends LocalStorage {
  constructor() {
    var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    super(config);

    var accessKeyId = config.accessKeyId,
        assetHost = config.assetHost,
        bucket = config.bucket,
        pathPrefix = config.pathPrefix,
        region = config.region,
        secretAccessKey = config.secretAccessKey,
        endpoint = config.endpoint,
        serverSideEncryption = config.serverSideEncryption,
        forcePathStyle = config.forcePathStyle,
        signatureVersion = config.signatureVersion,
        midnightPrefix = config.midnightPrefix,
        acl = config.acl;

    // Compatible with the aws-sdk's default environment variables

    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = process.env.AWS_DEFAULT_REGION || region;

    this.bucket = process.env.GHOST_STORAGE_ADAPTER_S3_PATH_BUCKET || bucket;

    // Optional configurations
    this.host = process.env.GHOST_STORAGE_ADAPTER_S3_ASSET_HOST || assetHost || `https://s3${this.region === 'us-east-1' ? '' : `-${this.region}`}.amazonaws.com/${this.bucket}`;
    this.pathPrefix = stripLeadingSlash(process.env.GHOST_STORAGE_ADAPTER_S3_PATH_PREFIX + midnightPrefix);
    this.endpoint = process.env.GHOST_STORAGE_ADAPTER_S3_ENDPOINT || endpoint || '';
    this.serverSideEncryption = process.env.GHOST_STORAGE_ADAPTER_S3_SSE || serverSideEncryption || '';
    this.s3ForcePathStyle = Boolean(process.env.GHOST_STORAGE_ADAPTER_S3_FORCE_PATH_STYLE) || Boolean(forcePathStyle) || false;
    this.signatureVersion = process.env.GHOST_STORAGE_ADAPTER_S3_SIGNATURE_VERSION || signatureVersion || 'v4';
    this.acl = process.env.GHOST_STORAGE_ADAPTER_S3_ACL || acl || 'public-read';

    // New store required fields
    this.staticFileURLPrefix = stripLeadingSlash(process.env.GHOST_STORAGE_ADAPTER_S3_PATH_PREFIX + midnightPrefix);
    this.siteUrl = assetHost;
    this.storagePath = midnightPrefix;
    this.midnightPrefix = midnightPrefix;
  }

  delete(fileName, targetDir) {
    var _this = this;

    var directory = targetDir || this.getTargetDir(this.pathPrefix);

    return new Promise(function (resolve, reject) {
      _this.s3().deleteObject({
        Bucket: _this.bucket,
        Key: stripLeadingSlash((0, _path.join)(directory, fileName))
      }, function (err) {
        return err ? resolve(false) : resolve(true);
      });
    });
  }

  exists(fileName, targetDir) {
    var _this2 = this;

    return new Promise(function (resolve, reject) {
      _this2.s3().getObject({
        Bucket: _this2.bucket,
        Key: stripLeadingSlash((0, _path.join)(targetDir, fileName))
      }, function (err) {
        return err ? resolve(false) : resolve(true);
      });
    });
  }

  s3() {
    var options = {
      bucket: this.bucket,
      region: this.region,
      signatureVersion: this.signatureVersion,
      s3ForcePathStyle: this.s3ForcePathStyle

      // Set credentials only if provided, falls back to AWS SDK's default provider chain
    };if (this.accessKeyId && this.secretAccessKey) {
      options.credentials = new _awsSdk2.default.Credentials(this.accessKeyId, this.secretAccessKey);
    }

    if (this.endpoint !== '') {
      options.endpoint = this.endpoint;
    }
    return new _awsSdk2.default.S3(options);
  }

  urlToPath(url) {
    return url;
  }

  saveRaw(buffer, targetPath) {
    // buffer = raw image data
    // targetPath =  Full image path - e.g. 2024/05/https-3a-2f-2fsubstack-post-media-s3-amazonaws-com-2fpublic-2fimages-2fccb4ad1b-54de-44a5-9be1-19b97419a88e_300x460-jpeg.jpg
    //var getFilename = targetPath.substring(targetPath.lastIndexOf('/')+1);

    var lastSlashIndex = targetPath.lastIndexOf('/');
    var dir = lastSlashIndex !== -1 ? targetPath.substring(0, lastSlashIndex) : '';
    var filename = lastSlashIndex !== -1 ? targetPath.substring(lastSlashIndex + 1) : targetPath;

    // Catch Icons & Thumbnails
    // --- if the path contains /icon/, add a timestamp to the filename ---
    if (targetPath.indexOf('/icon/') !== -1) {
        // filename = "icon.png" -> "icon-<timestamp>.png"
        var dotIndex = filename.lastIndexOf('.');
        var name = dotIndex !== -1 ? filename.substring(0, dotIndex) : filename;
        var ext = dotIndex !== -1 ? filename.substring(dotIndex) : '';

        var timestamp = Date.now(); // or use something else if you prefer
        filename = name + '-' + timestamp + ext;

        // rebuild targetPath with the new filename
        targetPath = (dir ? dir + '/' : '') + filename;
    }

    if (this.midnightPrefix == "") {
      var new_targetPath = [this.pathPrefix, targetPath].join('/');
    } else {
      var new_targetPath = [this.pathPrefix, this.midnightPrefix, targetPath].join('/');
    }

    // Get file type
    var mime_type = mime.lookup(filename);

    var _this3 = this;

      return new Promise(function (resolve, reject) {
          var config = {
            ACL: _this3.acl,
            Body: buffer,
            Bucket: _this3.bucket,
            CacheControl: `max-age=${30 * 24 * 60 * 60}`, 
            ContentType: mime_type,
            Key: stripLeadingSlash(new_targetPath)
          };
          if (_this3.serverSideEncryption !== '') {
            config.ServerSideEncryption = _this3.serverSideEncryption;
          }

          _this3.s3().putObject(config, function (err, data) {
            return err ? reject(err) : resolve(`${_this3.host}/${new_targetPath}`);
          });
      });
  }

  save(image, targetDir) {

    // Check target directory doesn't contain a full URL (i.e. http...)
    //targetDir = '';
    if(/(http(s?)):\/\//i.test(targetDir)) {
      targetDir = '';
    } else if (image.newPath) {

      var fullimagePath = image.newPath;
      var filename = fullimagePath.split('\\').pop().split('/').pop();
      var imagePath = (fullimagePath.replace(filename, "")).slice(0, -1);

      // Remove content/xxxx/ from path
      if (imagePath.includes("content/images/")) {
        imagePath = imagePath.replace("content/images/", "");
      }

      if (imagePath.includes("content/media/")) {
        imagePath = imagePath.replace("content/media/", "");
      }

      if (imagePath.includes("content/files/")) {
        imagePath = imagePath.replace("content/files/", "");
      }

      if (imagePath.includes("content/")) {
        imagePath = imagePath.replace("content/", "");
      }

      targetDir = imagePath;
    }

    // Check file has a type and if not, get one.
    if (!image.type) {
      var mime_type = mime.lookup(image.name)
      image.type = mime_type;
    }

    var _this3 = this;

    var directory = targetDir || this.getTargetDir(this.pathPrefix);
    var newdirectory = directory.split('/');

    var imageSizes = {s: { width: 300 },m: { width: 600 },l: { width: 1000 }};

    var imageDimensions = Object.keys(imageSizes).reduce(function (dimensions, size) {
      var _imageSizes$size = imageSizes[size],
          width = _imageSizes$size.width,
          height = _imageSizes$size.height;

      var dimension = (width ? 'w' + width : '') + (height ? 'h' + height : '');
      return Object.assign({
        [dimension]: imageSizes[size]
      }, dimensions);
    }, {});

    if(image.path.includes('_processed')) {

      // Resizes of Original File Only
      return new Promise(function (resolve, reject) {
        Promise.all([_this3.getUniqueFileName(image, directory), readFileAsync(image.path)]).then(function (_ref) {
          var _ref2 = _slicedToArray(_ref, 2),
              fileName = _ref2[0],
              file = _ref2[1];

          var config = {
            ACL: _this3.acl,
            Body: file,
            Bucket: _this3.bucket,
            CacheControl: `max-age=${30 * 24 * 60 * 60}`,
            ContentType: image.type,
            Key: stripLeadingSlash(fileName)
          };

          if (_this3.serverSideEncryption !== '') {
            config.ServerSideEncryption = _this3.serverSideEncryption;
          }

          Promise.all([_this3.s3().putObject(config).promise()].concat(_toConsumableArray(Object.keys(imageDimensions).map(function (imageDimension) {

            if (newdirectory.length == 4) {
              var size_path = (0, _path.join)(newdirectory[0], newdirectory[1], 'size', imageDimension, newdirectory[2], newdirectory[3]);
            } else {
              var size_path = (0, _path.join)(newdirectory[0], 'size', imageDimension, newdirectory[1], newdirectory[2]);
            }
            
            return Promise.all([_this3.getUniqueFileName(image, size_path), _imageTransform2.default.resizeFromBuffer(file, imageDimensions[imageDimension])]).then(function (_ref3) {
              var _ref4 = _slicedToArray(_ref3, 2),
                  name = _ref4[0],
                  transformed = _ref4[1];

              return Object.assign({}, config, { Body: transformed, Key: stripLeadingSlash(name) });
            }).then(function (config) {
              return _this3.s3().putObject(config).promise();
            });
          })))).then(function () {
            return resolve(`${_this3.host}/${fileName}`);
          }).catch(function (err) {
            return reject(err);
          });
        }).catch(function (err) {
          return reject(err);
        });
      });
    
    } else {

      return new Promise(function (resolve, reject) {
        Promise.all([_this3.getUniqueFileName(image, directory), readFileAsync(image.path)]).then(function (_ref) {
          var _ref2 = _slicedToArray(_ref, 2),
              fileName = _ref2[0],
              file = _ref2[1];
  
          var config = {
            ACL: _this3.acl,
            Body: file,
            Bucket: _this3.bucket,
            CacheControl: `max-age=${30 * 24 * 60 * 60}`,
            ContentType: image.type,
            Key: stripLeadingSlash(fileName)
          };
          if (_this3.serverSideEncryption !== '') {
            config.ServerSideEncryption = _this3.serverSideEncryption;
          }
          _this3.s3().putObject(config, function (err, data) {
            return err ? reject(err) : resolve(`${_this3.host}/${fileName}`);
          });
        }).catch(function (err) {
          return reject(err);
        });
      });

    }
  }

  serve() {
    var _this4 = this;

    return function (req, res, next) {
      return _this4.s3().getObject({
        Bucket: _this4.bucket,
        Key: stripLeadingSlash(stripEndingSlash(_this4.pathPrefix) + req.path)
      }).on('httpHeaders', function (statusCode, headers, response) {
        return res.set(headers);
      }).createReadStream().on('error', function (err) {
        res.status(404);
        next(err);
      }).pipe(res);
    };
  }

  read(options) {
    var _this5 = this;

    options = options || {};

    return new Promise(function (resolve, reject) {
      // remove trailing slashes
      var path = (options.path || '').replace(/\/$|\\$/, '');

      // check if path is stored in s3 handled by us
      if (!path.startsWith(_this5.host)) {
        reject(new Error(`${path} is not stored in s3`));
      }
      path = path.substring(_this5.host.length);

      _this5.s3().getObject({
        Bucket: _this5.bucket,
        Key: stripLeadingSlash(path)
      }, function (err, data) {
        return err ? reject(err) : resolve(data.Body);
      });
    });
  }
}

exports.default = Store;
module.exports = exports['default'];