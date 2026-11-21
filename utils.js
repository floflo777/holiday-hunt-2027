const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type, param1 = null, param2 = null, param3 = null) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.error("Error resuming AudioContext", e));
    }

    const now = audioCtx.currentTime;

    if (type === 'win') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g);
            g.connect(audioCtx.destination);
            o.type = 'triangle';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0, now + i * 0.1);
            g.gain.linearRampToValueAtTime(0.2, now + i * 0.1 + 0.05);
            g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.5);
            o.start(now + i * 0.1);
            o.stop(now + i * 0.1 + 0.5);
        });
    } else if (type === 'slide') {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start();
        osc.stop(now + 0.1);
    } else if (type === 'jump') {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start();
        osc.stop(now + 0.15);
    } else if (type === 'step') {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start();
        osc.stop(now + 0.08);
    } else if (type === 'crash') {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.28);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.28);
        osc.start();
        osc.stop(now + 0.28);
    } else if (type === 'explosion') {
        const lowOsc = audioCtx.createOscillator();
        const lowGain = audioCtx.createGain();
        lowOsc.connect(lowGain); lowGain.connect(audioCtx.destination);
        lowOsc.type = 'triangle'; lowOsc.frequency.setValueAtTime(120, now);
        lowOsc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
        lowGain.gain.setValueAtTime(0.8, now); lowGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        lowOsc.start(now); lowOsc.stop(now + 0.4);

        const bufferSize = audioCtx.sampleRate * 0.5;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = audioCtx.createBufferSource(); noise.buffer = buffer;
        const noiseFilter = audioCtx.createBiquadFilter(); noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, now); noiseFilter.frequency.linearRampToValueAtTime(0, now + 0.3);
        const noiseGain = audioCtx.createGain(); noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(audioCtx.destination);
        noise.start(now);
    } else if (type === 'playNote' && param1 !== null && param2 !== null && param3 !== null) { 
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = param1; 
        gain.gain.setValueAtTime(0.1, now + param2); 
        gain.gain.linearRampToValueAtTime(0, now + param2 + param3); 
        osc.start(now + param2);
        osc.stop(now + param2 + param3);
    }
}

/** Navigate to the next page. Page names are not secret: the seed words are encrypted (see hunt-core.js). */
function goToNextLevel(url) {
    window.location.href = url;
}
