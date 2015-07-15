# forge by Acision apps to control Parrot Jumping Sumo

Copyright (c) Acision 2015. All rights reserved.

These apps enable you to control (and receive a video stream from) a Parrot
Jumping Sumo drone using the forge By Acision platform.

There are two apps:
* A forgeAS app which runs on a "server" and acts as a gateway between the forge
  by Acision world and the Parrot world
* A forge web-app which is served to a browser and provides the user-interface to
  control the drone

You need your own forge By Acision API Keys to use this software.

## forgeAS app

The forgeAS app:
* Connects to the drone
* Translates status events from the drone into presence updates
* Translates IMs (containing json) into commands to control the drone
* Receives an MJPEG stream from the drone, converts it to DivX (using
  fluent-ffmpeg) and serves that new stream over HTTP on localhost
* Uses the Kurento Media Server to convert the local DivX stream to WebRTC for
  streaming to the user interface app

### Installing

To use the forgeAS app you have to install some third-party libraries. These
libraries and their dependencies are copyright to their owners and may only be
used under the terms of their license.

First download, install, and configure Kurento Media Server.

Then:
* Get the forgeAS tarball and install globally
* Create a new forgeAS app
* Install the dependencies into your forgeAS app (fluent-ffmpeg, node-sumo,
  kurento-client)
* Copy the forge-app.js file from here into your forgeAS app
* Run your forgeAS app

```
$ sudo npm install -g <directory containing tarball>/forge-as-<version>.tgz
$ forge-as init forge-sumo
$ cd forge-sumo
$ npm install fluent-ffmpeg
$ npm install git://github.com/forgeByAcision/node-sumo
$ npm install kurento-client
$ cp <directory containing forge-app.js>/forge-app.js .
$ forge-as start
```

## forge web-app

The forge web-app:
* Is logged into using Facebook
* Asks you to enter the ID of the drone you want to control
* Provides a user-interface so you can control the drone
* Displays the video stream from the drone (transmitted using WebRTC)

### Installing

To use the forge web-app you have to install some third-party libraries. These
libraries and their dependencies are copyright to their owners and may only be
used under the terms of their license.

You need a web-server to serve the web-app from.

* Unpack the web-app into a directory served by your web-server
* Create a js/ subdirectory within the web-app and copy for the forge By
  Acision JavaScript client library into it
* Install the dependencies into the js/ subdirectory (jQuery, jQuery UI,
  Underscore)
* Install the dependencies into the css/ subdirectory (jQuery UI Smoothness)

The directory structure should be something like:
```
 index.html   (part of the forge web-app)
|- audio      (part of the forge web-app)
|- img        (part of the forge web-app)
|- js
  |- jquery-1.11.0.js
  |- jquery-ui-1.10.4.custom.js
  |- sdk.js   (the forge JavaScript client library)
  |- underscore.js
|- css
  |- smoothness
    |- images
    |- jquery-ui-1.10.4.custom.css
```
