// ============================================
// MinhaVez — Sound Effects (Web Audio API)
// Extracted from tablet.html
// ============================================

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let _vendaAudio = null;

export function playSound(type) {
  if (!audioCtx) audioCtx = new AudioCtx();
  // iOS: se o ctx ficou suspended, tenta resumir (válido dentro de gesture)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch((err) => console.debug('[sound] resume blocked:', err?.name || err));
  }

  if (type === '__silent_unlock__') {
    // Cria e destrói um oscillator silencioso só pra destravar o ctx no iOS.
    // Som inaudível: gain zero + 10ms de duração.
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    g.gain.value = 0;
    o.start(t0);
    o.stop(t0 + 0.01);
    return;
  }

  if (type === 'atendimento') {
    // Two-tone ding
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.3);
    osc.start(t0);
    osc.stop(t0 + 0.3);
    // Second note
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.frequency.value = 1174;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.15, t0 + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, t0 + 0.5);
    osc2.start(t0 + 0.15);
    osc2.stop(t0 + 0.5);
  } else if (type === 'venda') {
    // Cash register "KA-CHING!"
    if (!_vendaAudio) {
      _vendaAudio = new Audio('/assets/cash-register.wav');
      _vendaAudio.volume = 0.7;
    }
    _vendaAudio.currentTime = 0;
    _vendaAudio.play().catch((err) => console.debug('[sound] venda play blocked:', err?.name || err));
  } else if (type === 'retorno') {
    // Two ascending notes (C6 → E6)
    const t0 = audioCtx.currentTime;
    const o1 = audioCtx.createOscillator();
    const g1 = audioCtx.createGain();
    o1.connect(g1);
    g1.connect(audioCtx.destination);
    o1.frequency.value = 1047;
    o1.type = 'sine';
    g1.gain.setValueAtTime(0.12, t0);
    g1.gain.exponentialRampToValueAtTime(0.01, t0 + 0.2);
    o1.start(t0);
    o1.stop(t0 + 0.2);
    const o2 = audioCtx.createOscillator();
    const g2 = audioCtx.createGain();
    o2.connect(g2);
    g2.connect(audioCtx.destination);
    o2.frequency.value = 1319;
    o2.type = 'sine';
    g2.gain.setValueAtTime(0.12, t0 + 0.12);
    g2.gain.exponentialRampToValueAtTime(0.01, t0 + 0.35);
    o2.start(t0 + 0.12);
    o2.stop(t0 + 0.35);
  } else if (type === 'levelup') {
    // Sub-level up (dentro do mesmo tier): 3 notas ascendentes rápidas
    // C5 → E5 → G5 (acorde maior) — 380ms total
    const t0 = audioCtx.currentTime;
    const notes = [
      { freq: 523, start: 0 }, // C5
      { freq: 659, start: 0.08 }, // E5
      { freq: 784, start: 0.16 } // G5
    ];
    notes.forEach((n) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      o.type = 'triangle';
      o.frequency.value = n.freq;
      g.gain.setValueAtTime(0.15, t0 + n.start);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + n.start + 0.3);
      o.start(t0 + n.start);
      o.stop(t0 + n.start + 0.32);
    });
  } else if (type === 'tierup') {
    // Fanfarra épica (mudança de tier maior): acorde maior ascendente +
    // acorde sustain + alta no final. ~1.8s total.
    const t0 = audioCtx.currentTime;
    const master = audioCtx.createGain();
    master.gain.value = 0.22;
    master.connect(audioCtx.destination);

    // Fase 1: arpeggio rápido C5-E5-G5-C6 (0-320ms)
    const arp = [
      { freq: 523, start: 0, dur: 0.12 }, // C5
      { freq: 659, start: 0.08, dur: 0.12 }, // E5
      { freq: 784, start: 0.16, dur: 0.12 }, // G5
      { freq: 1047, start: 0.24, dur: 0.2 } // C6
    ];
    arp.forEach((n) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(master);
      o.type = 'square';
      o.frequency.value = n.freq;
      g.gain.setValueAtTime(0, t0 + n.start);
      g.gain.linearRampToValueAtTime(0.3, t0 + n.start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.01, t0 + n.start + n.dur);
      o.start(t0 + n.start);
      o.stop(t0 + n.start + n.dur + 0.02);
    });

    // Fase 2: acorde sustain C5+E5+G5+C6 a partir de 450ms, ~1.2s
    const chord = [523, 659, 784, 1047];
    const chordStart = 0.45;
    const chordDur = 1.2;
    chord.forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(master);
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0 + chordStart);
      g.gain.linearRampToValueAtTime(0.18, t0 + chordStart + 0.05);
      g.gain.setValueAtTime(0.18, t0 + chordStart + chordDur - 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + chordStart + chordDur);
      o.start(t0 + chordStart);
      o.stop(t0 + chordStart + chordDur + 0.05);
    });

    // Fase 3: nota alta brilhante G6 no pico (750ms)
    const shine = audioCtx.createOscillator();
    const shineGain = audioCtx.createGain();
    shine.connect(shineGain);
    shineGain.connect(master);
    shine.type = 'sine';
    shine.frequency.value = 1568; // G6
    shineGain.gain.setValueAtTime(0, t0 + 0.75);
    shineGain.gain.linearRampToValueAtTime(0.25, t0 + 0.78);
    shineGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
    shine.start(t0 + 0.75);
    shine.stop(t0 + 1.45);
  } else if (type === 'fail') {
    // Sad trombone "wah wah wah wahhh"
    const t0 = audioCtx.currentTime;
    const notes = [
      { freq: 392, start: 0, dur: 0.28 },
      { freq: 370, start: 0.3, dur: 0.28 },
      { freq: 349, start: 0.6, dur: 0.28 },
      { freq: 311, start: 0.9, dur: 0.6 }
    ];
    notes.forEach((n) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(n.freq, t0 + n.start);
      // Vibrato on last note
      if (n.start === 0.9) {
        o.frequency.setValueAtTime(n.freq, t0 + n.start);
        o.frequency.linearRampToValueAtTime(n.freq - 15, t0 + n.start + 0.15);
        o.frequency.linearRampToValueAtTime(n.freq - 5, t0 + n.start + 0.3);
        o.frequency.linearRampToValueAtTime(n.freq - 25, t0 + n.start + 0.5);
      }
      g.gain.setValueAtTime(0.08, t0 + n.start);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + n.start + n.dur);
      o.start(t0 + n.start);
      o.stop(t0 + n.start + n.dur + 0.05);
    });
  }
}
