/** 抽奖页 Web Audio 音效（与 UI 解耦，便于扩展玩法） */

let _audioCtx: AudioContext | null = null;

export function getMemberSpinAudioContext(): AudioContext | null {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      _audioCtx = new AC();
    }
    if (_audioCtx.state === "suspended") void _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

export function playMemberSpinTick(pitch = 1) {
  const ctx = getMemberSpinAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 600 * pitch;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

export function playMemberSpinWin() {
  const ctx = getMemberSpinAudioContext();
  if (!ctx) return;
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.12;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

export function playMemberSpinMiss() {
  const ctx = getMemberSpinAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);
}

export function playMemberSpinStart() {
  const ctx = getMemberSpinAudioContext();
  if (!ctx) return;
  [440, 554, 660].forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  });
}
