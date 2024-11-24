let mediaRecorder;
let audioChunks = [];
const startButton = document.getElementById('startRecord');
const stopButton = document.getElementById('stopRecord');
const uploadButton = document.getElementById('uploadButton');
const responseDiv = document.getElementById('response');

startButton.addEventListener('click', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Explicit MIME type

    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const wavBlob = await convertToWav(audioBlob); // Convert to WAV for backend compatibility

        uploadButton.disabled = false;
        uploadButton.dataset.audioBlob = URL.createObjectURL(wavBlob); // Store WAV blob URL
    };

    audioChunks = [];
    mediaRecorder.start();
    startButton.disabled = true;
    stopButton.disabled = false;
});

stopButton.addEventListener('click', () => {
    mediaRecorder.stop();
    startButton.disabled = false;
    stopButton.disabled = true;
});

document.getElementById('uploadForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const audioBlobUrl = uploadButton.dataset.audioBlob;
    if (!audioBlobUrl) {
        responseDiv.innerHTML = "<p style='color: red;'>No recording to upload.</p>";
        return;
    }

    const audioBlob = await fetch(audioBlobUrl).then((res) => res.blob());
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    try {
        const response = await fetch('http://127.0.0.1:8000/transcribe', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.transcribed_text) {
            responseDiv.innerHTML = `<p>Transcription: ${result.transcribed_text}</p>`;
        } else if (result.error) {
            responseDiv.innerHTML = `<p style='color: red;'>Error: ${result.error}</p>`;
        }
    } catch (error) {
        console.error('Error:', error);
        responseDiv.innerHTML = "<p style='color: red;'>An error occurred while uploading the file.</p>";
    }
});

/**
 * Converts WebM audio Blob to WAV Blob.
 * @param {Blob} audioBlob - The WebM audio Blob.
 * @returns {Promise<Blob>} - A Promise resolving to a WAV Blob.
 */
async function convertToWav(audioBlob) {
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const decodedAudioData = await audioContext.decodeAudioData(audioBuffer);

    // Prepare WAV file data
    const wavBuffer = encodeWAV(decodedAudioData);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Encodes AudioBuffer to WAV format.
 * @param {AudioBuffer} audioData - The decoded audio data.
 * @returns {ArrayBuffer} - The WAV data.
 */
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

/**
 * Interleaves channel data for multi-channel WAV.
 * @param {Float32Array[]} channelData - Array of Float32Arrays for each channel.
 * @returns {Float32Array} - Interleaved audio data.
 */
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

/**
 * Writes a string into a DataView.
 * @param {DataView} view - The DataView.
 * @param {number} offset - The offset to start writing.
 * @param {string} string - The string to write.
 */
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
