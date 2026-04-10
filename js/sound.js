// ============================================
// MinhaVez — Sound Effects (Web Audio API)
// Extracted from tablet.html
// ============================================

const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let _vendaAudio = null;

export function playSound(type) {
  if (!audioCtx) audioCtx = new AudioCtx();

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
    _vendaAudio.play().catch(() => {});
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
