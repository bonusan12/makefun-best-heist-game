// Synthesised sound, no audio files: a tiny WebAudio kit. Everything is an oscillator or a
// burst of filtered noise, started on the first user gesture (browsers refuse audio before
// one) and kept quiet when the tab is hidden. The siren loops while the alarm is high.

export function createAudio() {
  let context = null;
  let master = null;
  let siren = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(frequency, seconds, type, volume, when, slideTo) {
    if (!ensure() || muted) return;
    const start = context.currentTime + (when ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + seconds);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  function noiseBurst(seconds, volume, frequency) {
    if (!ensure() || muted) return;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    /** Call from any user gesture so the browser lets audio start. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    /** A soft coin chime when a treasure is pocketed. */
    loot() {
      tone(880, 0.14, 'sine', 0.22, 0);
      tone(1318, 0.22, 'sine', 0.18, 0.09);
    },
    /** A low thud when a guard spots the thief. */
    spotted() {
      tone(220, 0.18, 'square', 0.14, 0, 110);
    },
    /** The puff of a smoke pellet. */
    smoke() {
      noiseBurst(0.5, 0.25, 900);
    },
    /** A short sting for getting caught. */
    caught() {
      tone(196, 0.5, 'sawtooth', 0.2, 0, 98);
      tone(147, 0.7, 'sawtooth', 0.16, 0.12, 73);
    },
    /** A rising jingle for the clean getaway. */
    win() {
      tone(523, 0.16, 'sine', 0.2, 0);
      tone(659, 0.16, 'sine', 0.2, 0.14);
      tone(784, 0.16, 'sine', 0.2, 0.28);
      tone(1046, 0.4, 'sine', 0.22, 0.42);
    },
    /** A soft tick while a grab fills up. */
    grabTick() {
      tone(1200, 0.05, 'sine', 0.06, 0);
    },
    /**
     * The alarm siren: call every frame with the alarm level (0..100). It fades in above
     * the siren threshold and its wail speeds up as the alarm climbs.
     */
    siren(alarm) {
      if (!ensure() || muted) return;
      const active = alarm >= 60;
      if (active && siren === null) {
        siren = context.createOscillator();
        siren.type = 'sine';
        sirenGain = context.createGain();
        sirenGain.gain.value = 0;
        siren.connect(sirenGain);
        sirenGain.connect(master);
        siren.start();
      }
      if (siren === null) return;
      if (!active) {
        sirenGain.gain.linearRampToValueAtTime(0, context.currentTime + 0.3);
        const dead = siren;
        window.setTimeout(() => {
          try {
            dead.stop();
          } catch {
            // Already stopped.
          }
        }, 400);
        siren = null;
        sirenGain = null;
        return;
      }
      const level = (alarm - 60) / 40;
      siren.frequency.setValueAtTime(620 + 260 * Math.sin(context.currentTime * (2 + level * 4)), context.currentTime);
      sirenGain.gain.setValueAtTime(0.02 + level * 0.05, context.currentTime);
    },
    setMuted(value) {
      muted = value;
    },
  };
}
