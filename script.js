let mediaRecorder;
let audioChunks = [];
const talkButton = document.getElementById('talkButton');
const uploadButton = document.getElementById('uploadButton');
const responseDiv = document.getElementById('response');

// Start recording on button press
talkButton.addEventListener('mousedown', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const wavBlob = await convertToWav(audioBlob);

            // Store the generated WAV Blob URL for uploading
            uploadButton.dataset.audioBlob = URL.createObjectURL(wavBlob);
        };

        audioChunks = [];
        mediaRecorder.start();
        talkButton.textContent = 'Recording...';
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Microphone access denied. Please allow microphone permissions.');
    }
});

// Stop recording on button release
talkButton.addEventListener('mouseup', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        talkButton.textContent = 'Talk';
    }
});

// Handle audio upload
document.getElementById('uploadForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const audioBlobUrl = uploadButton.dataset.audioBlob;
    if (!audioBlobUrl) {
        responseDiv.innerHTML = "<p style='color: red;'>No recording to upload.</p>";
        return;
    }

    try {
        const audioBlob = await fetch(audioBlobUrl).then((res) => res.blob());
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.wav');

        const response = await fetch('http://127.0.0.1:8000/transcribe', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();
        if (result.transcribed_text) {
            responseDiv.innerHTML = `<p>Transcription: ${result.transcribed_text}</p>`;
            llm_answer(result.transcribed_text);
        } else {
            responseDiv.innerHTML = `<p style='color: red;'>Error: ${result.error || 'Unknown error.'}</p>`;
        }
    } catch (error) {
        console.error('Error uploading audio:', error);
        responseDiv.innerHTML = "<p style='color: red;'>An error occurred during upload.</p>";
    }
});

// Helper: Convert WebM to WAV
async function convertToWav(audioBlob) {
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const decodedAudioData = await audioContext.decodeAudioData(audioBuffer);

    const wavBuffer = encodeWAV(decodedAudioData);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

// Helper: Encode WAV
function encodeWAV(audioData) {
    const numberOfChannels = audioData.numberOfChannels;
    const sampleRate = audioData.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;

    const channelData = [];
    for (let i = 0; i < numberOfChannels; i++) {
        channelData.push(audioData.getChannelData(i));
    }

    const interleaved = interleave(channelData);
    const buffer = new ArrayBuffer(44 + interleaved.length * 2);
    const view = new DataView(buffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + interleaved.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, format, true); // AudioFormat
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * (bitsPerSample / 8), true); // ByteRate
    view.setUint16(32, numberOfChannels * (bitsPerSample / 8), true); // BlockAlign
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, interleaved.length * 2, true);

    // Write interleaved PCM samples
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++, offset += 2) {
        view.setInt16(offset, interleaved[i] * 0x7FFF, true);
    }

    return buffer;
}

// Helper: Interleave channel data
function interleave(channelData) {
    const length = channelData[0].length;
    const interleaved = new Float32Array(length * channelData.length);

    let offset = 0;
    for (let i = 0; i < length; i++) {
        for (let j = 0; j < channelData.length; j++) {
            interleaved[offset++] = channelData[j][i];
        }
    }

    return interleaved;
}

// Helper: Write string to DataView
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
async function llm_answer(prompt) {
    const aiTalkingDiv = document.getElementById('ai_talking'); // Target div for LLM response

    try {
        const apiResponse = await fetch(`http://localhost:8000/get_answer?key=myapikey`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "contents": [
                    {
                        "parts": [
                            { "text": 
                                `
                                Eres un chatbot que solo contesta en espanol de una institucion financiera ficticia llamado "Banco Nota 100" con el slogan "Donde tus projectos se hacen realidad", 
                                el usuario a modo de rol te hizo  la pregunta siguiente pregunta: "${prompt}" 
                                contesta de modo ameno y profecional,
                                posibles respuestas:
                                - Si el usuario saluda tipo hola o buenas contesta "Buenas tardes" y dices la bienvenida al banco con el slogan
                                - Si se trata de horarios de funcionamiento o de trabajo, trabajamos de lunes a sabado de 8:00 am a 6:00 pm
                                - Nuestros cajeros funcionan 24 7
                                - si es sobre nuestros cajeros, en caso la pregunta sea de que horas funcionan 24/7, si es de cuales cajeros funcionan, contesta la sirena o jumbo
                                - Si se da el caso de que la pregunta no tenga que ver con las posibles respuestas, responde: "No tengo informacion sobre ello favor llamar al servicio al cliente o ir a una sucursal"
                        
                                al final cada tanto puede que si puede que no responde "Algo mas de lo que le pueda ayudar?"
                                Si el usuario contesta no respondes "gracias por utilizar nuestros servicios"
                                
                                `
                        }
                        ]
                    }
                ]
            }),
            mode: 'cors',
        });

        const apiResult = await apiResponse.json();
        console.log('LLM Response:', apiResult); // Log the entire response
        // aiTalkingDiv.innerHTML = `<p>AI Response: ${apiResult.answer}</p>`;
        aiTalkingDiv.innerHTML = `<p>${JSON.stringify(apiResult)}</p>`;
        // aiTalkingDiv.innerHTML = `<p>AI Response: ${apiResult.answer.replace(/\\n/g, '<br>').replace(/\\"/g, '"')}</p>`;

        // // Display response in the frontend
        // if (apiResult && apiResult.answer) {
        //     aiTalkingDiv.innerHTML = `<p>AI Response: ${apiResult.answer}</p>`;
        // } else {
        //     // aiTalkingDiv.innerHTML = `<p style="color: red;">No response from AI. Response was: ${JSON.stringify(apiResult)}</p>`;
        // }

        return apiResult; // Return result for further processing if needed
    } catch (error) {
        console.error('Error fetching LLM answer:', error);

        // Display error on the frontend
        aiTalkingDiv.innerHTML = `<p style="color: red;">Error fetching AI response. Please try again.</p>`;
    }
}
