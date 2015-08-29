/**
 * Copyright (c) Acision 2015. All rights reserved.
 */

// Configuration
var API_KEY = "<API KEY>";
var USERNAME = "<USERNAME>";
var PASSWORD = "<PASSWORD>";
var KURENTO_WSURI = "ws://localhost:8888/kurento";
var DRONE_VIDEO_HOSTNAME = "localhost";
var DRONE_VIDEO_PORT = 8080; 

// the app...
var kurento = require("kurento-client");
var kurentoPipeline = null;

var sumo = require("node-sumo");
var drone = sumo.createClient();
var droneConnected = null;

var http = require("http");
var ffmpeg = require("fluent-ffmpeg");

var sdkObject = null;

/**
 * @callback initCallback
 * @param err {Object} The error object to log. Set to null if there was no error.
 * @param sdkConfig {Object} The SDK configuration to use.
 * @param sdkConfig.apiKey {String} The API key associated with this application.
 * @param sdkConfig.username {String} The service name associated with this application.
 * @param sdkConfig.password {String} The shared secret associated with the service name.
 */

/**
 * Application initialisation function.
 *
 * The callback must provide the SDK configuration for this application.
 *
 * The SDK configuration could be static (as in this example) or it could be
 * read from a file, database, etc.
 *
 * @param initComplete {initCallback}
 */
function init(initComplete) {
  var sdkConfig = {
    apiKey: API_KEY,
    username: USERNAME,
    password: PASSWORD,
    persistent: true
  };

  initComplete(null, sdkConfig);
}

/**
 * Application start function.
 *
 * The Forge Application Server passes in an instance of the AcisionSDK for the
 * application to use.
 *
 * @param sdk {AcisionSDK} The SDK instance
 * @see https://docs.sdk.acision.com/api/latest/javascript/
 */
function start(sdk) {
  sdk.webrtc.setCallbacks(
    { "onIncomingSession" : handleSession }
  );

  sdk.messaging.setCallbacks(
    { "onMessage" : handleMessage }
  );

  configureDroneStatusUpdates(sdk);
  connectToDrone(sdk);
  serveDroneVideo();

  sdkObject = sdk;
}

/**
 * Application shutdown function.
 *
 * Called when the Application Server has been asked to shut down gracefully.
 * At this point, the SDK instance is still valid, so any existing sessions can
 * be closed down before executing the callback function.
 *
 * @param shutdownComplete {Function} Callback to execute when the application
 * has finished shutting down.
 */
function shutdown(shutdownComplete) {
  sdkObject.presence.deleteOwnPresentity({
    "onSuccess" : function() {
      shutdownComplete();
    }
  });
}

/**
 * Application disconnected function.
 *
 * Called when the SDK instance has been disconnected, which may be after a
 * graceful shutdown, or may be due to an unexpected failure. The application
 * should not attempt to use the SDK instance during or after this call, but
 * can perform other clean-up, save persistent data, etc.
 *
 * @param stopped {Function} Callback to execute when the application
 * has finished its clean-up.
 */
function disconnected(stopped) {
  freeKurentoPipeline();
  stopped();
}

module.exports = {
  "init" : init,
  "start" : start,
  "shutdown" : shutdown,
  "disconnected" : disconnected
};

// Get the Kurento pipeline (create one if required)
function getKurentoPipeline(callback) {
  if (kurentoPipeline !== null) {
    return callback(null, kurentoPipeline);
  }

  kurento(KURENTO_WSURI, function(error, kurentoClient) {
    if (error) {
      return callback(error);
    }

    kurentoClient.create('MediaPipeline', function(error, _pipeline) {
      if (error) {
        return callback(error);
      }

      kurentoPipeline = _pipeline;
      return callback(null, kurentoPipeline);
    });
  });
}

// Close Kurento connection
function freeKurentoPipeline() {
  if (kurentoPipeline !== null) {
    kurentoPipeline.release();
    kurentoPipeline = null;
  }
}

// Handle incoming connection from the client
function handleSession(event) {
  console.log("Incoming session from: " + event.session.address);

  event.session.setCallbacks({
    onClose: function(data) {
      freeKurentoPipeline();
    }
  });

  if (!connectToVideo(event.session)) {
    event.session.close();
  }
}

// For now stream a movie instead of video from the drone...
function connectToVideo(session) {
  sdpOffer = session.streamConfig.mediaDescription;

  getKurentoPipeline(function(error, pipeline) {
    if (error) {
      console.log("Error getting Kurento pipeline: " + error);
      return false;
    }

    console.log("Retrieved Kurento pipeline...");

    pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
      if (error) {
        console.log("Error creating Kurento WebRtcEndpoint: " + error);
        return false;
      }

      console.log("WebRtcEndpoint created...");

      webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
        if (error) {
          webRtcEndpoint.release();
          console.log("Error during Kurento processing of SDP offer", error);
          return false;
        }

        console.log("SDP offer processed by Kurento...");

        pipeline.create('PlayerEndpoint',
          { uri: "http://" + DRONE_VIDEO_HOSTNAME + ":" + DRONE_VIDEO_PORT },
          function(error, playerEndpoint) {
            if (error) {
              webRtcEndpoint.release();
              console.log("Error creating Kurento PlayerEndpoint: " + error);
              return false;
            }

            console.log("PlayerEndpoint created...");

            playerEndpoint.connect(webRtcEndpoint, function(error, pipeline) {
              if (error) {
                webRtcEndpoint.release();
                playerEndpoint.release();
                console.log("Error connecting endpoints: " + error);
                return false;
              }

              session.accept(
                { "mediaDescription" : sdpAnswer }
              );

              playerEndpoint.play(function(error) {
                if (error) {
                  webRtcEndpoint.release();
                  playerEndpoint.release();
                  console.log("Error playing media: " + error);
                  return false;
                }
              });
            });
          });
        });
    });
  });

  return true;
}

// The drone control commands come in as instant messages
function handleMessage(event) {
  if (event.contentType != "application/json") {
    console.log("Received non-JSON message");
    return;
  }

  if (!droneConnected) {
    console.log("Not connected to Jumping Sumo");
    return;
  }

  move = JSON.parse(event.content);
  if (move.motion) {
    var moveTime = 500;
    var turnTime = 125;
    var timeout = 0;

    switch(move.motion) {
    case "forward":
      drone.forward(50);
      timeout = moveTime;
      break;
    case "backward":
      drone.backward(50);
      timeout = moveTime;
      break;
    case "left":
      drone.left(50);
      timeout = turnTime;
      break;
    case "right":
      drone.right(50);
      timeout = turnTime;
      break;
    }

    if (timeout > 0) {
      droneStop(timeout);
    }
  } else if (move.jump) {
    switch(move.jump) {
    case "high":
      drone.animationsHighJump();
      break;
    case "long":
      drone.animationsLongJump();
      break;
    }
  } else if (move.posture) {
    switch(move.posture) {
    case "standing":
      drone.postureStanding();
      break;
    case "jumper":
      drone.postureJumper();
      break;
    case "kicker":
      drone.postureKicker();
      break;
    }
  }
}

function droneStop(time) {
  setTimeout(function () {
    drone.stop();
  }, time);
}

// Drone status is published using presence
function configureDroneStatusUpdates(sdk) {
  sdk.presence.setOwnPresentity({
    "connected" : "no",
    "battery-level" : "100",
    "battery-status" : "ok",
    "posture" : "unknown",
    "jump-load" : "unknown",
    "jump-motor" : "ok"
  });

  drone.on("battery", function(data) {
    sdk.presence.setOwnPresentity({
      "battery-level" : String(data)
    });
  });
  drone.on("batteryCritical", function() {
     sdk.presence.setOwnPresentity({
      "battery-status" : "critical"
    });
  });
  drone.on("batteryLow", function() {
     sdk.presence.setOwnPresentity({
      "battery-status" : "low"
    });
  });

  drone.on("postureStanding", function() {
    sdk.presence.setOwnPresentity({
      "posture" : "standing"
    });
  });
  drone.on("postureJumper", function() {
    sdk.presence.setOwnPresentity({
      "posture" : "jumper"
    });
  });
  drone.on("postureKicker", function() {
    sdk.presence.setOwnPresentity({
      "posture" : "kicker"
    });
  });
  drone.on("postureStuck", function() {
    sdk.presence.setOwnPresentity({
      "posture" : "stuck"
    });
  });
  drone.on("postureUnknown", function() {
    sdk.presence.setOwnPresentity({
      "posture" : "unknown"
    });
  });

  drone.on("jumpLoadUnknown", function() {
    sdk.presence.setOwnPresentity({
      "jump-load" : "unknown"
    });
  });
  drone.on("jumpLoadUnloaded", function() {
    sdk.presence.setOwnPresentity({
      "jump-load" : "unloaded"
    });
  });
  drone.on("jumpLoadLoaded", function() {
    sdk.presence.setOwnPresentity({
      "jump-load" : "loaded"
    });
  });
  drone.on("jumpLoadBusy", function() {
    sdk.presence.setOwnPresentity({
      "jump-load" : "busy"
    });
  });
  drone.on("jumpLoadLowBatteryUnloaded", function() {
    sdk.presence.setOwnPresentity({
      "jump-load" : "low-battery-unloaded"
    });
  });
  drone.on("jumpLoadLowBatteryLoaded", function() {
    sdk.presence.setOwnPresentity({
      "jump-load" : "low-battery-loaded"
    });
  });

  drone.on("jumpMotorOK", function() {
    sdk.presence.setOwnPresentity({
      "jump-motor" : "ok"
    });
  });
  drone.on("jumpMotorErrorBlocked", function() {
    sdk.presence.setOwnPresentity({
      "jump-motor" : "error-blocked"
    });
  });
  drone.on("jumpMotorErrorOverheated", function() {
    sdk.presence.setOwnPresentity({
      "jump-motor" : "error-overheated"
    });
  });
}

function connectToDrone(sdk) {
  drone.connect(function() {
    console.log("Connected to Jumping Sumo");
    droneConnected = true;
    sdk.presence.setOwnPresentity({
      "connected" : "yes" 
    });
  });
}

function serveDroneVideo() {
  http.createServer(function(req, res) {
    var videoStream = ffmpeg(drone.getVideoStream())
			.preset("divx")
			.pipe();

    videoStream.pipe(res);
    videoStream.on("error", function() {
      console.log(err);
    });
  }).listen(DRONE_VIDEO_PORT, DRONE_VIDEO_HOSTNAME);
}
