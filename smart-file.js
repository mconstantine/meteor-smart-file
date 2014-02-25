function defaultZero (val) {
  return _.isUndefined(val) ? 0 : val;
}

SmartFile = function (options) {
  options = options || {};
  this._id = options._id || Meteor.uuid();

  this.dirPath = options.dirPath || "";
  this.name = options.name;
  this.type = options.type || "unknown";
  this.size = defaultZero(options.size);
  this.data = options.data;

  this.start = defaultZero(options.start);
  this.end = defaultZero(options.end);
  this.bytesUploaded = defaultZero(options.bytesUploaded);
  this.bytesDownloaded = defaultZero(options.bytesDownloaded);
  this.status = options.status || "";
  this.uploadProgress = defaultZero(options.uploadProgress);
  this.downloadProgress = defaultZero(options.downloadProgress);
};

SmartFile.fromJSONValue = function (value) {
  return new SmartFile({
    _id: value._id,
    dirPath: value.dirPath,
    name: value.name,
    type: value.type,
    size: value.size,
    data: EJSON.fromJSONValue(value.data),

    start: value.start,
    end: value.end,
    bytesUploaded: value.bytesUploaded,
    bytesDownloaded: value.bytesDownloaded,
    uploadProgress: value.uploadProgress,
    downloadProgress: value.downloadProgress,
    status: value.status
  });
};

SmartFile.prototype = {
  constructor: SmartFile,

  typeName: function () {
    return "SmartFile";
  },

  equals: function (other) {
    return this._id == other._id;
  },

  clone: function () {
    return new SmartFile({
      _id: this._id,
      dirPath: this.dirPath,
      name: this.name,
      type: this.type,
      size: this.size,
      data: this.data,

      start: this.start,
      end: this.end,
      bytesUploaded: this.bytesUploaded,
      bytesDownloaded: this.bytesDownloaded,
      uploadProgress: this.uploadProgress,
      downloadProgress: this.downloadProgress,
      status: this.status
    });
  },

  toJSONValue: function () {
    return {
      _id: this._id,
      dirPath: this.dirPath,
      name: this.name,
      type: this.type,
      size: this.size,
      data: EJSON.toJSONValue(this.data),

      start: this.start,
      end: this.end,
      bytesUploaded: this.bytesUploaded,
      bytesDownloaded: this.bytesDownloaded,
      uploadProgress: this.uploadProgress,
      downloadProgress: this.downloadProgress,
      status: this.status
    };
  }
};

EJSON.addType("SmartFile", SmartFile.fromJSONValue);

if (Meteor.isClient) {
  SmartFile.files = new Meteor.Collection(null);
  Downloads = new Meteor.Collection(null);

  _.extend(SmartFile.prototype, {
    read: function (file, callback) {
      var reader = new FileReader();
      var self = this;

      reader.onload = function () {
        self.data = new Uint8Array(reader.result);
        self._setUStatus();
        SmartFile.files.insert(self);

        callback && callback(null, self);
      };

      reader.onerror = function () {
        callback && callback(reader.error);
      };

      reader.readAsArrayBuffer(file);
    },

    upload: function (method, callback) {
      if ( ! _.isString(method))
        throw new Meteor.Error("First parameter of upload must be a Meteor.method name.");

      var self = this;
      var chunkSize = 1024 * 1024 * 2; /* 2MB */
      this.rewind();

      var uploadChunk = function () {
        if (self.bytesUploaded < self.size) {
          self.start = self.end;
          self.end += chunkSize;

          if (self.end > self.size)
            self.end = self.size;
          
          var originalData = self.data;
          
          if ((self.end - self.start) > 0)
            self.data = self.data.subarray(self.start, self.end);

          Meteor.call(method, self, function (err) {
            if (err) {
              self._setUStatus(err);
              callback && callback(err);
            }
            else {
              self.bytesUploaded += self.data.length;
              self._setUStatus();
              self.data = originalData;
              uploadChunk();
            }
          });
        }
        else callback && callback();
      };

      uploadChunk();
    },

    download: function (callback) {
      this._setDStatus();
      var self = this;

      Meteor.call("ZG93bmxvYWQ", this, function (err, res) {
        if (err) callback && callback(err);
        else {
          self.size = res.size;
          self.type = res.type;
          self.data = [];

          Downloads.update(self._id, {
            $set: {
              size: self.size,
              type: self.type
            }
          });

          var chunkSize = 1024 * 1024 * 2; /* 2MB */

          var downloadChunk = function () {
            if (self.bytesDownloaded < self.size) {
              self.start = self.end;
              self.end += chunkSize;

              if (self.end > self.size)
                self.end = self.size;

              Meteor.call("ZG93bmxvYWRDaHVuaw", _.omit(self, "data"), function (err, res) {
                if (err) {
                  self._setDStatus(err);
                }
                else {
                  self.bytesDownloaded += res.length;
                  self.data = self.data.concat(res);
                  self._setDStatus();
                  downloadChunk();
                }
              });
            }
            else {
              self.data = new Uint8Array(self.data);
              Downloads.update(self._id, {
                $set: {
                  data: self.data
                }
              });
              callback && callback();
            }
          };

          downloadChunk();
        }
      });
    },

    _setUStatus: function (err) {
      if (err) {
        this.status = err.toString();
        this.rewind();
      }
      else {
        this.uploadProgress = this.bytesUploaded == 0 ? 0 :
          Math.round(this.bytesUploaded / this.size * 100);
        this.status = (function (u) {
          if (u.uploadProgress == 100) return "Uploaded";
          else if (u.uploadProgress > 0) return "Uploading...";
          else return "Loaded";
        })(this);

        SmartFile.files.update(this._id, {
          $set: {
            uploadProgress: this.uploadProgress,
            status: this.status
          }
        });
      }
    },

    _setDStatus: function (err) {
      if (err) {
        this.status = err.toString();
        this.rewind();
      }
      else {
        this.downloadProgress = this.bytesDownloaded == 0 ? 0 :
          Math.round(this.bytesDownloaded / this.size * 100);

        this.status = (function (u) {
          if (u.downloadProgress == 100) return "Downloaded";
          else if (u.downloadProgress > 0) return "Downloading...";
          else return "Selected";
        })(this);

        Downloads.update(this._id, {
          $set: {
            downloadProgress: this.downloadProgress,
            status: this.status
          }
        });
      }
    },

    rewind: function () {
      this.start = 0;
      this.end = 0;
      this.bytesUploaded = 0;
      this.uploadProgress = 0;
      this.downloadProgress = 0;
    },

    delete: function (callback) {
      SmartFile.files.remove(this._id);

      Meteor.call("ZGVsZXRl", _.omit(this, "data"), function (err, res) {
        if (err) callback && callback(err);
        else {
          callback && callback();
        }
      });
    },

    fromImageData: function (data) {
      data = data.match(/^data:image\/[a-z]+;base64,(.+)/);

      if (data) {
        data = atob(data[1]);
        var arr = [];

        for (var i = 0, length = data.length; i < length; i++)
          arr.push(data.charCodeAt(i));
        
        this.size = data.length;
        this.data = new Uint8Array(arr);
        
        SmartFile.files.update(this._id, {
          $set: {
            data: this.data,
            size: this.size
          }
        });
      }

      return this;
    },

    makeImage: function () {
      if (this.data && /^image\/[a-z]+$/.test(this.type)) {
        var str = "";

        for (var i = 0, length = this.data.length; i < length; i++)
          str += String.fromCharCode(this.data[i]);

        str = btoa(str);

        return '<img src="data:' + this.type + ';base64,' + str + '">';
      }
    },

    humanize: function () {
      if (this.size < 1024) return Math.round(this.size / 1024 * 100) / 100 + " KB";
      if (this.size < Math.pow(1024, 2))
        return Math.round(this.size / Math.pow(1024, 1) * 100) / 100 + " KB";
      if (this.size < Math.pow(1024, 3))
        return Math.round(this.size / Math.pow(1024, 2) * 100) / 100 + " MB";
      if (this.size < Math.pow(1024, 4))
        return Math.round(this.size / Math.pow(1024, 3) * 100) / 100 + " GB";
    }
  });

  _.extend(SmartFile, {
    read: function (file, callback) {
      return new SmartFile(file).read(file, callback);
    },

    upload: function (file, method, callback) {
      return new SmartFile(file).read(file, function (err, file) {
        if (err) callback(err);
        else file.upload(method, callback);
      });
    },

    download: function (fileName, dirPath, callback) {
      if (arguments.length < 3) {
        callback = dirPath;
        dirPath = "";
      }

      var file = Downloads.findOne({
        dirPath: dirPath,
        name: fileName
      });

      if ( ! file) {
        file = new SmartFile({
          dirPath: dirPath,
          name: fileName
        });

        Downloads.insert(file);
        file.download(callback);
      }
      return Downloads.findOne(file._id);
    },

    makeImage: function (file) {
      return new SmartFile(file).makeImage();
    },

    fromImageData: function (file, img) {
      return new SmartFile(file).fromImageData(img);
    }
  });
}

if (Meteor.isServer) {
  var fs = Npm.require("fs");
  var path = Npm.require("path");

  _.extend(SmartFile.prototype, {
    defaultFolder: null,

    save: function (dirPath, options) {
      if ( ! this.defaultFolder)
        throw new Meteor.Error("Default folder not defined.");

      this.dirPath = dirPath;
      
      var filePath = path.join(this.defaultFolder, dirPath, sanitize(this.name));
      var buffer = new Buffer(this.data);
      var mode = this.start == 0 ? 'w' : 'a';
      var fd = fs.openSync(filePath, mode);
      fs.writeSync(fd, buffer, 0, buffer.length, this.start);
      fs.closeSync(fd);
    }
  });

  _.extend(SmartFile, {
    setFolder: function (folder) {
      this.prototype.defaultFolder = folder;
    }
  });

  Meteor.methods({
    ZG93bmxvYWQ: function (file) {
      if ( ! SmartFile.prototype.defaultFolder)
        throw new Meteor.error("Default folder not defined.");

      var fileName = sanitize(file.name);
      var filePath = path.join(file.defaultFolder, file.dirPath, fileName);
      var size = fs.statSync(filePath).size;
      var type = Mimer.mime(fileName);
      return {
        type: type,
        size: size
      };
    },

    ZG93bmxvYWRDaHVuaw: function (file) {
      if ( ! SmartFile.prototype.defaultFolder)
        throw new Meteor.error("Default folder not defined.");

      var filePath = path.join(SmartFile.prototype.defaultFolder, file.dirPath, sanitize(file.name));
      var buffer = new Buffer(file.end - file.start);
      
      try {
        var fd = fs.openSync(filePath, "r");
      }
      catch (e) {
        throw new Meteor.Error(e.toString());
      }

      var bytesRead = fs.readSync(fd, buffer, 0, buffer.length, file.start);
      return buffer.toJSON();
    },

    ZGVsZXRl: function (file) {
      if ( ! SmartFile.prototype.defaultFolder)
        throw new Meteor.error("Default folder not defined.");

      var filePath = path.join(SmartFile.prototype.defaultFolder, file.dirPath, sanitize(file.name));

      try {
        fs.unlinkSync(filePath);
      }
      catch (e) {
        throw new Meteor.Error(e.toString());
      }
    }
  });
  
  function sanitize(fileName) {
    return fileName.replace(/\//g, "").replace(/\.\.+/g, ".");
  }
}