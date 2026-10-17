// Détecteur de tirs : dépassement de seuil d'amplitude + temps mort.
// Tourne dans le thread audio ; horodate à l'échantillon près (currentFrame + index).

class ShotDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.threshold = 0.5;        // amplitude linéaire 0..1
    this.deadFrames = Math.round(0.08 * sampleRate);
    this.armFrame = Infinity;    // aucun tir signalé avant ce frame
    this.lastShotFrame = -Infinity;
    this.levelPeak = 0;
    this.levelCount = 0;
    this.levelEvery = Math.round(sampleRate / 40); // ~40 messages/s pour le vu-mètre
    // Mesure de latence : premier dépassement après captureFrom.
    this.captureFrom = Infinity;
    this.captureThreshold = 0.1;

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'config') {
        if (m.threshold != null) this.threshold = m.threshold;
        if (m.deadTime != null) this.deadFrames = Math.round(m.deadTime * sampleRate);
      } else if (m.type === 'arm') {
        this.armFrame = Math.round(m.time * sampleRate);
        this.lastShotFrame = -Infinity;
      } else if (m.type === 'disarm') {
        this.armFrame = Infinity;
      } else if (m.type === 'capture') {
        this.captureFrom = Math.round(m.time * sampleRate);
        this.captureThreshold = m.threshold;
      }
    };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const n = ch.length;
    let blockPeak = 0;
    for (let i = 0; i < n; i++) {
      const v = ch[i] < 0 ? -ch[i] : ch[i];
      if (v > blockPeak) blockPeak = v;
      const frame = currentFrame + i;
      if (v >= this.threshold && frame >= this.armFrame &&
          frame - this.lastShotFrame >= this.deadFrames) {
        this.lastShotFrame = frame;
        // Pic du tir : on regarde la fin du bloc pour une valeur indicative.
        let peak = v;
        for (let j = i + 1; j < n; j++) { const w = Math.abs(ch[j]); if (w > peak) peak = w; }
        this.port.postMessage({ type: 'shot', frame, peak });
      }
      if (v >= this.captureThreshold && frame >= this.captureFrom) {
        this.captureFrom = Infinity;
        this.port.postMessage({ type: 'captured', frame });
      }
    }
    if (blockPeak > this.levelPeak) this.levelPeak = blockPeak;
    this.levelCount += n;
    if (this.levelCount >= this.levelEvery) {
      this.port.postMessage({ type: 'level', peak: this.levelPeak });
      this.levelPeak = 0;
      this.levelCount = 0;
    }
    return true;
  }
}

registerProcessor('shot-detector', ShotDetector);
