const Crypt = require("g-crypt");
const speech = require("@google-cloud/speech");
const textToSpeech = require("@google-cloud/text-to-speech");
const querystring = require("querystring");
const express = require("express");
const request = require("request");
const saltedMd5 = require("salted-md5");
var app = express();
var path = require("path");
var http = require("http").Server(app);
const bodyParser = require("body-parser");
var fs = require("fs");
const config = require("./serverConfig.js");
const s3 = require("./saveToS3.js");
const io = require("socket.io")(http, { path: config.socketPath });
let crypter = Crypt(config.passphraseTransit);

var jsonParser = bodyParser.json({
  limit: 1024 * 1024 * 20,
  type: "application/json"
});
var urlencodedParser = bodyParser.urlencoded({
  extended: true,
  limit: 1024 * 1024 * 20,
  type: "application/x-www-form-urlencoding"
});
app.use(function(req, res, next) {
  var filename = path.basename(req.url);
  // console.log("The file " + filename + " was requested.");
  next();
});
app.use(jsonParser);
app.use(urlencodedParser);
app.use(express.static(path.join(__dirname, "assets")));

const apiMetrics = require('prometheus-api-metrics');
app.use(apiMetrics())
const PORT = process.argv[2] || 5000;

http.listen(PORT, function() {
  console.log("listening on :" + PORT);
});

process.env.GOOGLE_APPLICATION_CREDENTIALS = config.googleKeyPath;

app.get("/", (req, res) => {
  res.send("voice running");
});

function getSpeech(body) {
  return new Promise(async (resolve, reject) => {
    try {
      //console.log("GET SPEECH")
      let text = body.text;
      let languageCode = body.languageCode || "en-US";
      let gender = body.gender || "FEMALE";
      let name = text + languageCode + gender;
      let code = await hashCode(name);
      if (!(await isFilePresent(code))) {
        // console.log("File Not Present!", code);
        await saveFile(
          code,
          await convertTextToSpeech(text, languageCode, gender)
        );
        while (!(await isFilePresent(code))) {}
        setTimeout(() => {
          return resolve({
            url: config.url + code + ".mp3",
            status: "success"
          });
        }, 100);
      } else {
        // console.log("File Present!", code);
        return resolve({
          url: config.url + code + ".mp3",
          status: "success"
        });
      }
    } catch (e) {
      console.error(e);
      return reject({ data: e, status: "failed" });
    }
  });
  function convertTextToSpeech(text, languageCode, gender) {
    return new Promise((resolve, reject) => {
      const request = {
        input: { ssml: text },
        voice: { languageCode: languageCode, ssmlGender: gender },
        audioConfig: { audioEncoding: "MP3" }
      };
      const client = new textToSpeech.TextToSpeechClient();
      client.synthesizeSpeech(request, (err, response) => {
        if (err) {
          return reject(err);
        }
        return resolve(response.audioContent);
      });
    });
  }

  function readFileFromUrl(url) {
    return new Promise((resolve, reject) => {
      request({ uri: url }, (error, response, body) => {
        if (error) {
          //console.log("ERROR")
          console.error(error);
          return reject(error);
        }
        return resolve(body);
      });
    });
  }

  function isFilePresent(code) {
    return new Promise(async (resolve, reject) => {
      try {
        fs.access(__dirname + "/assets/" + code + ".mp3", fs.F_OK, err => {
          if (err) {
            // console.error(err)
            return resolve(false);
          }
          return resolve(true);
          //file exists
        });
      } catch (e) {
        console.error(e);
        return reject(e);
      }
    });
  }
  function hashCode(s) {
    return new Promise(async (resolve, reject) => {
      try {
        return resolve(await saltedMd5(s, config.salt));
      } catch (e) {
        console.error(e);
        return reject(e);
      }
    });
  }

  function saveFile(code, audioContent) {
    return new Promise(async (resolve, reject) => {
      try {
        //aws test bundle js
        fs.writeFile(
          __dirname + "/assets/" + code + ".mp3",
          audioContent,
          "base64",
          function(err, data) {
            if (err) {
              //console.log("ERROR in WRITING")
              console.error(err);
              return resolve(err);
            }

            return resolve(data);
          }
        );
        // return resolve(await s3.upload(await hashCode(name)+".mp3","",audioContent));
      } catch (e) {
        console.error(e);
        return reject(e);
      }
    });
  }
}

io.on("connection", function(socket) {
  let speechConn = false;
  //console.log("Socket Connection Initiated")
  socket.on("disconnect", () => {});
  socket.on("web-text-to-speech", async function(data) {
    try {
      data = crypter.decrypt(data);
      // console.log(data.data,"data text")
      socket.emit(
        "web-text-to-speech-" + data.webId + "-" + data.requestId,
        crypter.encrypt(await getSpeech(data.data))
      );
    } catch (e) {
      console.error(e);
      socket.emit(
        "web-text-to-speech-" + data.webId + "-" + data.requestId,
        crypter.encrypt({ error: e })
      );
    }
  });

  socket.on("web-speech-to-text-start", function (data) {
    try {
      if (!speechConn) {
        data = crypter.decrypt(data);
        startRecognitionStream(this, data);
        console.log("start recording")
        speechConn = true;
      }
    }
    catch (e) {
      console.error(e)
    }
  });
  socket.on("web-speech-to-text-stop", function(data) {
    data = crypter.decrypt(data);
    speechConn = false;
    //console.log("stop recording")
    stopRecognitionStream(socket, data);
  });
  socket.on("web-speech-to-text-binary-data", function(data) {
    // data=crypter.decrypt(data)
    //console.log("stream")
    if (recognizeStream !== null) {
      recognizeStream.write(data.c);
    }
  });
  let recognizeStream = null;
  function startRecognitionStream(socket, data) {
    const speechClient = new speech.SpeechClient();
    recognizeStream = speechClient
      .streamingRecognize(request)
      .on("error", console.error)
      .on("data", data => {
        process.stdout.write(
          data.results[0] && data.results[0].alternatives[0]
            ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
            : `\n\nReached transcription time limit, press Ctrl+C\n`
        );
        socket.emit("speech-data", crypter.encrypt(data));
        // if end of utterance, let's restart stream
        // this is a small hack. After 65 seconds of silence, the stream will still throw an error for speech length limit
        if (data.results[0] && data.results[0].isFinal) {
          if (recognizeStream) {
            recognizeStream.end();
          }
          recognizeStream = null;
        }
      });
  }
  function stopRecognitionStream(socket, data) {
    if (recognizeStream) {
      recognizeStream.end();
    }
    recognizeStream = null;
    socket.emit("speech-end", crypter.encrypt({}));
  }
  // =========================== GOOGLE CLOUD SETTINGS ================================ //
  // The encoding of the audio file, e.g. 'LINEAR16'
  // The sample rate of the audio file in hertz, e.g. 16000
  // The BCP-47 language code to use, e.g. 'en-US'
  const encoding = "LINEAR16";
  const sampleRateHertz = 16000;
  const languageCode = "en-US"; //en-US

  const request = {
    config: {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      profanityFilter: false,
      enableWordTimeOffsets: true
    },
    interimResults: true // If you want interim results, set this to true
  };
});
