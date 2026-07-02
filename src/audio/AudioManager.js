import * as THREE from 'three';

const SAMPLE_RATE = 44100;

// Real file drop-in point: public/assets/audio/<name>.mp3 (see SOUND_DEFS below). Until
// one exists, load() below falls back to the matching synthesize() function so the game
// has working (if crude) audio out of the box.
const SOUND_DEFS = {
  wind: { url: 'wind.mp3', synthesize: synthWindLoop },
  tireRoll: { url: 'tire-roll.mp3', synthesize: synthTireRollLoop },
  jump: { url: 'jump.mp3', synthesize: synthJump },
  crash: { url: 'crash.mp3', synthesize: synthCrash },
  music: { url: 'music.mp3', synthesize: synthMusicLoop },
};

function createBuffer(context, channelData) {
  const buffer = context.createBuffer(1, channelData.length, SAMPLE_RATE);
  buffer.copyToChannel(channelData, 0);
  return buffer;
}

// Brown noise (integrated white noise) — a low, breathy rumble standing in for a real
// wind ambience recording.
function synthWindLoop(context) {
  const length = 4 * SAMPLE_RATE;
  const data = new Float32Array(length);
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = brown * 3.5;
  }
  return createBuffer(context, data);
}

// Plain white noise — a placeholder for a real tire-on-gravel recording.
function synthTireRollLoop(context) {
  const length = 2 * SAMPLE_RATE;
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.6;
  }
  return createBuffer(context, data);
}

// A short rising tone.
function synthJump(context) {
  const length = Math.floor(0.25 * SAMPLE_RATE);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const freq = 220 + t * 440;
    data[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * (1 - t);
  }
  return createBuffer(context, data);
}

// A fast-decaying noise burst.
function synthCrash(context) {
  const length = Math.floor(0.5 * SAMPLE_RATE);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    data[i] = (Math.random() * 2 - 1) * (1 - t) ** 3;
  }
  return createBuffer(context, data);
}

// A soft three-note drone loop.
function synthMusicLoop(context) {
  const length = 8 * SAMPLE_RATE;
  const data = new Float32Array(length);
  const freqs = [130.81, 164.81, 196.0];
  for (let i = 0; i < length; i += 1) {
    let sample = 0;
    for (const freq of freqs) sample += Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    data[i] = (sample / freqs.length) * 0.3;
  }
  return createBuffer(context, data);
}

export class AudioManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.loader = new THREE.AudioLoader();
    this.buffers = new Map();
  }

  async init(baseUrl) {
    await Promise.all(
      Object.entries(SOUND_DEFS).map(async ([name, { url, synthesize }]) => {
        try {
          const buffer = await this.loader.loadAsync(`${baseUrl}assets/audio/${url}`);
          this.buffers.set(name, buffer);
        } catch {
          // No real file yet — fall back to the synthesized placeholder.
          this.buffers.set(name, synthesize(this.listener.context));
        }
      }),
    );
  }

  playLoop(name, volume = 1) {
    const buffer = this.buffers.get(name);
    if (!buffer) return null;
    const audio = new THREE.Audio(this.listener);
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(volume);
    audio.play();
    return audio;
  }

  playOnce(name, volume = 1) {
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const audio = new THREE.Audio(this.listener);
    audio.setBuffer(buffer);
    audio.setVolume(volume);
    audio.play();
  }
}
