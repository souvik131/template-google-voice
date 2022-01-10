
                let resultText = document.getElementById('jubi-result-text'),
                removeLastSentence = true,
                streamStreaming = false;

            const constraints = {
                audio: true,
                video: false
            };

            function clearSpeechText() {
                wholeString = "";
                while (resultText && resultText.firstChild) {
                    resultText.removeChild(resultText.firstChild);
                }
                document.getElementById('jubi-recording-text').style.display = "none";
                document.getElementById("pm-buttonlock").style.paddingBottom = "0px";
            }
            //voice
            function hideVoice() {
                try {
                    document.getElementById('pm-textInput').style.display = "block";
                    document.getElementById('jubi-recording-text').style.display = "none";
                    document.getElementById('button-play-ws').setAttribute('disabled', 'disabled');
                    document.getElementById('button-stop-ws').setAttribute('disabled', 'disabled');
                } catch (e) {
                    // //console.log(e);
                }
            }

            //voice ui -----------
            if (voiceEnabled) {
                addVoiceListeners();
            }

            async function disconnectVoice() {
                $("#jubi-bxinput").fadeIn(100);
                $("#button-send").fadeIn(100);
                $("#keyboard-icon").hide();
                $("#voice-buttons").hide();
                $("#jubi-answerBottom").focus();
                $("#button-stop-ws").hide();
                $("#button-play-ws").show();
                recordSemaphore = false;
                wholeString = "";
                clearSpeechText();
                await stopAllRecordings();
            }

            function showVoice() {

                $("#jubi-bxinput").hide();
                $("#button-send").hide();
                $("jubi-recording-text").show();
                $("#keyboard-icon").fadeIn(50);
                $("#voice-buttons").fadeIn(50);
            }

            function addVoiceListeners() {
                $("#keyboard-icon").click(disconnectVoice);
                $("#jubi-graySend").click(function () {
                    if (voiceEnabled && online) {
                        showVoice();
                    }
                });
                $("#jubi-redSend").click(function () {
                    if (voiceEnabled && online) {
                        showVoice();
                    }
                });
                $("#button-play-ws").click(() => {
                    recordSemaphore = true;
                    speechToText();
                });
                $("#button-stop-ws").click(async () => {
                    recordSemaphore = false;
                    if (wholeString) {
                        run(wholeString, "speech");
                    }
                    clearSpeechText();
                    await stopAllRecordings();
                });
            }

            function hideStop() {
                $("#button-stop-ws").hide();
                $("#button-play-ws").show();
            }

            function hidePlay() {
                stopVoice();
                $("#button-play-ws").hide();
                $("#button-stop-ws").show();
            }

            //voice ui -----------

            //stop recording----

            function stopAllRecordings() {
                return new Promise((resolve, reject) => {
                    try {
                        if (!online) {
                            return reject({ status: "offline" });
                        }
                        if (recognizer) {
                            recognizer.stop();
                            hideStop();
                            return resolve();
                        } else if (globalStream) {
                            streamStreaming = false;
                            socketVoice.emit('web-speech-to-text-stop', crypterTransit.encrypt({ webId: webId }));
                            let track = globalStream.getTracks()[0];
                            track.stop();
                            if (input) {
                                input.disconnect(processor);
                                processor.disconnect(context.destination);
                                context.close().then(function () {
                                    input = null;
                                    processor = null;
                                    context = null;
                                    AudioContext = null;
                                    hideStop();
                                    return resolve();
                                });
                            } else {
                                hideStop();
                                return resolve();
                            }
                        } else {
                            socketVoice.emit('web-speech-to-text-stop', crypterTransit.encrypt({ webId: webId }));
                            hideStop();
                            return resolve();
                        }
                    } catch (e) {
                        hideStop();
                        return reject(e);
                    }
                });
            }

            //stop recording----


            //voice record------------------


            async function speechToText() {
                try {
                    lastActiveTimestamp = new Date().getTime();
                    let interval = setInterval(async () => {
                        if (new Date().getTime() - lastActiveTimestamp > 15000) {
                            await stopAllRecordings();
                            clearInterval(interval);
                        }
                    }, 1000);
                    try {
                        await startRecordingOnBrowser();
                    } catch (e) {
                        await startRecordingFromAPI();
                    }
                    hidePlay();
                } catch (e) {
                    // //console.log(e);
                }
            }

            function capitalize(s) {
                if (s.length < 1) {
                    return s;
                }
                return s.charAt(0).toUpperCase() + s.slice(1);
            }

            function addTimeSettingsInterim(speechData) {
                try {
                    wholeString = speechData.results[0].alternatives[0].transcript;
                } catch (e) {
                    // //console.log(e)
                    wholeString = speechData.results[0][0].transcript;
                }

                let nlpObject = window.nlp(wholeString).out('terms');

                let words_without_time = [];

                for (let i = 0; i < nlpObject.length; i++) {
                    //data
                    let word = nlpObject[i].text;
                    let tags = [];

                    //generate span
                    let newSpan = document.createElement('span');
                    newSpan.innerHTML = word;

                    //push all tags
                    for (let j = 0; j < nlpObject[i].tags.length; j++) {
                        tags.push(nlpObject[i].tags[j]);
                    }

                    //add all classes
                    for (let j = 0; j < nlpObject[i].tags.length; j++) {
                        let cleanClassName = tags[j];
                        // //console.log(tags);
                        let className = `nl-${cleanClassName}`;
                        newSpan.classList.add(className);
                    }

                    words_without_time.push(newSpan);
                }

                finalWord = false;
                // endButton.disabled = true;

                return words_without_time;
            }

            function addTimeSettingsFinal(speechData) {
                let words = [];
                try {
                    wholeString = speechData.results[0].alternatives[0].transcript;
                    words = speechData.results[0].alternatives[0].words;
                } catch (e) {
                    // //console.log(e)
                    wholeString = speechData.results[0][0].transcript;
                }
                let nlpObject = window.nlp(wholeString).out('terms');

                let words_n_time = [];

                for (let i = 0; i < words.length; i++) {
                    //data
                    let word = words[i].word;
                    let startTime = `${words[i].startTime.seconds}.${words[i].startTime.nanos}`;
                    let endTime = `${words[i].endTime.seconds}.${words[i].endTime.nanos}`;
                    let tags = [];

                    //generate span
                    let newSpan = document.createElement('span');
                    newSpan.innerHTML = word;
                    newSpan.dataset.startTime = startTime;

                    //push all tags
                    for (let j = 0; j < nlpObject[i].tags.length; j++) {
                        tags.push(nlpObject[i].tags[j]);
                    }

                    //add all classes
                    for (let j = 0; j < nlpObject[i].tags.length; j++) {
                        let cleanClassName = nlpObject[i].tags[j];
                        // //console.log(tags);
                        let className = `nl-${cleanClassName}`;
                        newSpan.classList.add(className);
                    }

                    words_n_time.push(newSpan);
                }

                return words_n_time;
            }

            function startRecordingOnBrowser() {
                return new Promise(async (resolve, reject) => {
                    // return reject()
                    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
                    if (window.SpeechRecognition === null) {
                        return reject();
                    } else {
                        recognizer = new window.SpeechRecognition();
                        recognizer.continuous = false;
                        recognizer.interimResults = true;
                        recognizer.lang = "en-IN";
                        recognizer.onresult = getResults;
                        try {
                            recognizer.start();
                        } catch (ex) {
                            // //console.log(ex)
                            await stopAllRecordings();
                        }
                        recognizer.onerror = async function (event) {
                            // //console.log(event)
                            await stopAllRecordings();
                        };
                        return resolve();
                    }
                });
            }

            socketVoice.on('speech-data', data => {
                data = crypterTransit.decrypt(data);
                getResults(data);
            });

            function startRecordingFromAPI() {
                function microphoneProcess(e) {
                    let left = e.inputBuffer.getChannelData(0);
                    let left16 = downsampleBuffer(left, 44100, 16000);
                    if (online) {
                        socketVoice.emit('web-speech-to-text-binary-data', { c: left16 });
                    }
                    function downsampleBuffer(buffer, sampleRate, outSampleRate) {
                        if (outSampleRate == sampleRate) {
                            return buffer;
                        }
                        if (outSampleRate > sampleRate) {
                            throw "downsampling rate show be smaller than original sample rate";
                        }
                        let sampleRateRatio = sampleRate / outSampleRate;
                        let newLength = Math.round(buffer.length / sampleRateRatio);
                        let result = new Int16Array(newLength);
                        let offsetResult = 0;
                        let offsetBuffer = 0;
                        while (offsetResult < result.length) {
                            let nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
                            let accum = 0,
                                count = 0;
                            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                                accum += buffer[i];
                                count++;
                            }

                            result[offsetResult] = Math.min(1, accum / count) * 0x7FFF;
                            offsetResult++;
                            offsetBuffer = nextOffsetBuffer;
                        }
                        return result.buffer;
                    }
                }
                window.onbeforeunload = function () {
                    if (streamStreaming && online) {
                        socketVoice.emit('web-speech-to-text-stop', crypterTransit.encrypt({ webId: webId }));
                    }
                };
                return new Promise(async (resolve, reject) => {
                    try {
                        if (!online) {
                            return reject({ status: "offline" });
                        }
                        socketVoice.emit('web-speech-to-text-start', crypterTransit.encrypt({ webId: webId })); //init socket Google Speech Connection
                        streamStreaming = true;
                        AudioContext = window.AudioContext || window.webkitAudioContext;
                        context = new AudioContext();
                        processor = context.createScriptProcessor(bufferSize, 1, 1);
                        processor.connect(context.destination);
                        context.resume();
                        let handleSuccess = function (stream) {
                            globalStream = stream;
                            input = context.createMediaStreamSource(stream);
                            if (input) {
                                input.connect(processor);
                                processor.onaudioprocess = function (e) {
                                    microphoneProcess(e);
                                    return resolve();
                                };
                            }
                        };
                        navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess).catch(e => {
                            // //console.log(e);
                            return reject(e);
                        });
                    } catch (e) {
                        return reject(e);
                    }
                });
            }

            async function getResults(data) {
                // //console.log("RESPONSE")
                // //console.log(data.results)
                document.getElementById('jubi-recording-text').style.display = "block";
                lastActiveTimestamp = new Date().getTime();
                let dataFinal = undefined || data.results[0].isFinal;
                if (dataFinal === false) {
                    if (removeLastSentence) {
                        resultText.lastElementChild.remove();
                    }
                    removeLastSentence = true;

                    //add empty span
                    let empty = document.createElement('span');
                    resultText.appendChild(empty);

                    //add children to empty span
                    let edit = addTimeSettingsInterim(data);

                    for (let i = 0; i < edit.length; i++) {
                        resultText.lastElementChild.appendChild(edit[i]);
                        resultText.lastElementChild.appendChild(document.createTextNode('\u00A0'));
                    }
                    let height = parseInt($("#jubi-recording-text").height()) + 10;
                    document.getElementById("pm-buttonlock").style.paddingBottom = height + "px";
                    scrollUp();
                } else if (dataFinal === true) {
                    if (resultText.lastElementChild) {
                        resultText.lastElementChild.remove();
                    }
                    //add empty span
                    let empty = document.createElement('span');
                    resultText.appendChild(empty);

                    //add children to empty span
                    let edit = addTimeSettingsFinal(data);
                    for (let i = 0; i < edit.length; i++) {
                        if (i === 0) {
                            edit[i].innerText = capitalize(edit[i].innerText);
                        }
                        resultText.lastElementChild.appendChild(edit[i]);

                        if (i !== edit.length - 1) {
                            resultText.lastElementChild.appendChild(document.createTextNode('\u00A0'));
                        }
                    }
                    resultText.lastElementChild.appendChild(document.createTextNode('\u00A0'));
                    // //console.log(wholeString);
                    // //console.log("Google Speech sent 'final' Sentence.");

                    finalWord = true;
                    removeLastSentence = false;
                    run(wholeString, "speech");
                    clearSpeechText();
                    await stopAllRecordings();
                }
                // //console.log("HEIGHT")
                // //console.log($("#jubi-recording-text").height())
            }

            //voice record------------------


            //speech out-------
            async function textToSpeech(text) {
                try {
                    await stopAllRecordings();
                } catch (e) {
                    // //console.log(e);
                }
                try {
                    let postSpeech;
                    // try{
                    //     postSpeech=await convertAndPlaySpeechOnBrowser(text);
                    // }
                    // catch(e){
                    postSpeech = await convertAndPlaySpeechFromAPI(text);
                    // }
                    // afterVoiceOut(postSpeech);
                } catch (e) {
                    // //console.log(e);
                }
            }

            function afterVoiceOut(e) {
                if (recordSemaphore) {
                    speechToText();
                    hidePlay();
                }
            }

            function stopVoice() {
                window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
                // if(window.SpeechRecognition != null&&responsiveVoice&&responsiveVoice.voiceSupport()){
                //     responsiveVoice.cancel();
                // }
                if (flush && isPlaying(flush)) {
                    flush.pause();
                    flush.currentTime = 0;
                }
            }