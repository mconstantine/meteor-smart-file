meteor-smart-file
=================

File handling (reading, uploading, downloading, deleting) for Meteor

This an adaptation of meteor-file package from cmather (https://github.com/EventedMind/meteor-file), with some changes, like supporting reading and uploading a file into separate steps. The `mimer.js` file is an adaptation of the "Node.js File Extension Content Type" gist from rrobe53 (https://gist.github.com/rrobe53/976610).

Installation
=================

This package is not hosted on Atmosphere yet (it will be when I'll have time for making some test), so for installing it you have to clone the repo, put it into the `packages` folder of your Meteor project and then run `meteor add smart-file` from your project folder.

Usage
=================

### SmartFile(options)

Create a new `SmartFile` from a file taken from a file input or a drop event, or just pass an object with some properties if you want to download an existing file:

```javascript
// Get a file from an <input type="file">
var input = document.querySelector("input[type=file]");
var files = input.files[0];
var smartFile = new SmartFile(file);

// or prepare a file for a download
var smartFile = new SmartFile({
  name: "myFile.txt"
});
```

### SmartFile.read(file, [callback])

For reading a file that you created from a file input, call the `SmartFile.read(file, callback)` function.

```javascript
var smartFile = new SmartFile(file);
smartFile.read(file, function (err, sFile) {
  // If there was an error, err is a Meteor.Error
  // otherwise, err is undefined and sFile is the SmartFile
});
```

You can create and read a file with a single command like this:

```javascript
SmartFile.read(file, function (err, sFile) {
  // Same as calling new SmartFile(file).read(file, callback)
});
```

Every read file is inserted into a `Meteor.Collection`. You can find it into the `SmartFile.files` variable. This is useful if you want (and you probably do) to visualize some information about the files.

```html
<template name="myFiles">
  {{#each files}}
    <!-- Render file information here -->
  {{/each}}
</template>
```

```javascript
Template.myFiles.helpers({
  files: function () {
    return SmartFile.files.find();
  }
});
```

When a file is read, the properties that are updated are:

- name: file name and extension;
- type: file MIME type;
- size: file size in bytes;
- data: file data (binary array);
- status: "Loaded".

### SmartFile.upload(method, [callback])

For uploading a file, the first thing you need to is to provide a default directory for saving them. This must be done server side, and prevents the client from uploading files in unwanted locations.

```javascript
if (Meteor.isServer) { // or in a server side only file
  Meteor.startup(function () {
    SmartFile.setFolder("/Users/me/Pictures");
  });
}
```

After setting a folder, you can call upload on your `SmartFile` providing a `Meteor.method` name and an optional callback function. The file is uploaded in chunks, 2MB (2097152 byte) at a time, and the Meteor method specified as the first parameter is called once for every chunk, passing the uploading `SmartFile` as the first parameter. When all the file chunks are saved, the `callback` function is called if provided.

Server side, `SmartFile` instances provide a `save` method, that incrementally saves the file into the given subdirectory of the `defaultFolder`.

```javascript
if (Meteor.isClient) {
  // Upload the first file into the SmartFile collection
  SmartFile.files[0].upload("saveFile", function (err) {
    if (err) console.log("Uh-oh, something went wrong!");
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    SmartFile.setFolder("/Users/me/Pictures");
  });

  Meteor.methods({
    saveFile: function (file) {
      file.save("path/to/folder");
      // File will be saved in /Users/me/Pictures/path/to/folder
    }
  });
}
```

You can read and upload a file in a single command with:

```javascript
SmartFile.upload(file, "saveFile", function () {
  /*
   * This reads the file, calling this callback on error
   * if the file is read properly, it is uploaded
   */
});
```

Finally, when you upload a file, a progress is kept into the collection, and the file status changes.

```html
<template name="myFiles">
  {{#each files}}
    {{> file}}
  {{/each}}
</template>

<template name="file">
  {{#if isUploading}}
    <!--
    This will show something like
    10% Uploading...
    50% Uploading...
    100% Uploaded
    -->
    <p>{{status}} {{uploadProgress}}%</p>
  {{/if}}
</template>
```

```javascript
Template.myFiles.helpers({
  files: function () {
    return SmartFile.files.find();
  },
  
  isUploading: function () {
    return this.uploadProgress > 0;
  }
});
```

### SmartFile.download(callback)

Like for `upload`, you need to to provide a default directory that contains your files. This must be done server side, and prevents the client from downloading files from unwanted locations.

```javascript
if (Meteor.isServer) { // or in a server side only file
  Meteor.startup(function () {
    SmartFile.setFolder("/Users/me/Pictures");
  });
}
```

After setting a folder, you can call download on your `SmartFile`, provided that it has a `name` property and exists on your server or disk. The function returns immediately a `Cursor` to the `SmartFile` instance that is created for downloading the file. The file is downloaded in chunks, 2MB (2097152 byte) at a time, and the callback function specified as the first parameter is called when all the file chunks are downloaded, passing the new `SmartFile`.

> Warning: downloaded files are not inserted into the `SmartFile.files` collection.

Finally, when you download a file, a progress is kept into the collection, and the file status changes.

```html
<template name="myDownload">
  {{#with download}}
    {{> file}}
  {{/with}}
</template>

<template name="file">
    <!--
    This will show something like
    0% Selected
    10% Downloading...
    50% Downloading...
    100% Downloaded
    -->
    <p>{{status}} {{uploadProgress}}%</p>
  {{/if}}
</template>
```

```javascript
Template.myDownload.helpers({
  download: function () {
    var sFile = new SmartFile({
      dirPath: "path/to/subdirectory",
      name: "myFile.txt"
    });
    return sFile.download(function (err, file) {
      // file is the downloaded SmartFile
    });
  }
});
```

You can call download a file withour creating a new instance calling `SmartFile.download(fileName, [dirPath], [callback])` directly:

```javascript
Template.myDownload.helpers({
  download: function () {
    return SmartFile.download("myFile.txt", "path/to/subdirectory", function (err, file) {
      // file is the downloaded SmartFile
    });
  }
});
```

### SmartFile.delete([callback])

This deletes a file from disk. It works both with downloaded and uploaded files, so be careful to remove the default folder if your application is not protected enough. For disabling this functionality, you can call `SmartFile.setFolder(false);` from the server. If you don't disable it, anyone could create a file pointing to any file in your default directory and delete it.

```javascript
mFile.delete(function (err) {
  // err is usually thrown if the file doesn't exist
});
```

For reducing at minimum security issues, `delete` can be called only from an existing instance of `SmartFile`.

Utilities
=================

### SmartFile.makeImage() and SmartFile.fromImageData(data)

These are useful when working with images. `SmartFile.makeImage()` creates an `<image>` HTML element from the binary file data. The `src` attribute of the image element is base64 encoded, so the image can be inserted directly into the DOM.

```javascript
// Get a file from an <input type="file">
var input = document.querySelector("input[type=file]");
var files = input.files[0];
var smartFile = new SmartFile(file);

console.log(smartFile.makeImage());
```

Will output something line `<img src="data:image/jpeg;base64,...">` with a base64 encoded string that represents the image.

The exact same thing is calling `SmartFile.makeImage(file);`. It creates a new `SmartFile` and returns the image element and returns the `SmartFile` instance.

`SmartFile.fromImageData()` does the opposite thing, but takes the `src` string instead of an `<image>` element:

```javascript
var myImage = document.querySelector("img");
var data = myImage.getAttribute("src");
var sFile = new SmartFile({/* ... */});

sFile = sFile.fromImageData(data);

// or

sFile = SmartFile.fromImageData({/* ... */}, data);
```

> Warning: `SmartFile` cannot create an instance from an image URL.

`makeImage` and `fromImageData` are designed for working together in cases such as a profile picture setting. In this case a file is read and turned into a `SmartFile`, then shown as a preview, eventually cropped through a `Canvas` (that returns a base64 encoded string with `toDataURL`) and updated before uploading.

### humanize()

This function takes no parameters and returns a human readable version of the file size. For example, if the file size is 1.112.076 byte, calling `smartFile.humanize()` (where `smartFile` is a `SmartFile` instance) returns `"1.1MB`.
