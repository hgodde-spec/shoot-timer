// Moteur audio : contexte, micro, détecteur (AudioWorklet ou repli), bip, latence.
// Toute la mesure du temps repose sur l'horloge audio (ctx.currentTime / frames).

import { getSettings, onSettingsChange, dbToAmp } from '../settings.js';

const WORKLET_URL = new URL('./detector-worklet.js', import.meta.url);

class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.detector = null;      // AudioWorkletNode ou objet de repli
    this.mode = null;          // 'worklet' | 'script'
    this.micState = 'off';     // 'off' | 'starting' | 'on' | 'denied' | 'error'
    this.micError = '';
    this.lastLevel = 0;
    this._starting = null;
    onSettingsChange(() => this._pushConfig());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._recover();
    });
  }

  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 48000; }
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // À appeler dans un gestionnaire de geste utilisateur (touchend / click).
  unlock() {
    // iOS 16.4+ : catégorie de session audio lecture + enregistrement.
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'play-and-record') {
        navigator.audioSession.type = 'play-and-record';
      }
    } catch { /* non supporté */ }

    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.ctx.addEventListener('statechange', () => this._emit('state'));
      // Un buffer silencieux joué dans le geste débloque la sortie sur iOS.
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  async startMic() {
    if (this.micState === 'on' && this.stream && this.stream.active) return true;
    if (this._starting) return this._starting;
    this._starting = this._startMic().finally(() => { this._starting = null; });
    return this._starting;
  }

  async _startMic() {
    this.unlock();
    this._setMic('starting');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._setMic('error', 'Micro indisponible : la page doit être servie en HTTPS.');
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      this._setMic(denied ? 'denied' : 'error',
        denied ? 'Accès au micro refusé. Autorisez-le dans Réglages iOS › Safari › Micro.'
               : `Micro indisponible (${err && err.name})`);
      return false;
    }
    const track = this.stream.getAudioTracks()[0];
    if (track) track.addEventListener('ended', () => this._setMic('off'));

    if (this.source) this.source.disconnect();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    if (!this.detector) await this._createDetector();
    this.source.connect(this.mode === 'worklet' ? this.detector : this.detector.node);
    this._pushConfig();
    this._setMic('on');
    return true;
  }

  async _createDetector() {
    const sink = this.ctx.createGain();
    sink.gain.value = 0;          // le détecteur doit être relié à la sortie pour tourner
    sink.connect(this.ctx.destination);

    if (this.ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        await this.ctx.audioWorklet.addModule(WORKLET_URL);
        const node = new AudioWorkletNode(this.ctx, 'shot-detector', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        });
        node.port.onmessage = (e) => this._onDetectorMessage(e.data);
        node.connect(sink);
        this.detector = node;
        this.mode = 'worklet';
        return;
      } catch (err) {
        console.warn('AudioWorklet indisponible, repli ScriptProcessor', err);
      }
    }
    this.detector = createScriptDetector(this.ctx, (m) => this._onDetectorMessage(m));
    this.detector.node.connect(sink);
    this.mode = 'script';
  }

  _post(msg) {
    if (!this.detector) return;
    if (this.mode === 'worklet') this.detector.port.postMessage(msg);
    else this.detector.receive(msg);
  }

  _pushConfig() {
    const s = getSettings();
    this._post({ type: 'config', threshold: dbToAmp(s.thresholdDb), deadTime: s.deadTimeMs / 1000 });
  }

  _onDetectorMessage(m) {
    if (m.type === 'level') {
      this.lastLevel = m.peak;
      this._emit('level', m.peak);
    } else if (m.type === 'shot') {
      this._emit('shot', { time: m.frame / this.sampleRate, peak: m.peak });
    } else if (m.type === 'captured') {
      this._emit('captured', { time: m.frame / this.sampleRate });
    }
  }

  _setMic(state, error = '') {
    this.micState = state;
    this.micError = error;
    this._emit('mic', { state, error });
  }

  async _recover() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // iOS coupe le micro en arrière-plan : on le relance au retour.
    if (this.stream && !this.stream.active && this.micState !== 'denied') {
      this.micState = 'off';
      await this.startMic();
    }
  }

  // Le détecteur ne signale aucun tir avant `time` (horloge audio, s).
  arm(time) { this._post({ type: 'arm', time }); }
  disarm() { this._post({ type: 'disarm' }); }

  // Programme le bip à `when` (horloge audio). Retourne { end, cancel }.
  scheduleBeep(when, opts = {}) {
    const s = getSettings();
    const ctx = this.ctx;
    const dur = (opts.ms ?? s.beepMs) / 1000;
    const vol = opts.volume ?? s.beepVolume;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = s.beepSquare ? 'square' : 'sine';
    osc.frequency.value = opts.freq ?? s.beepFreq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol, when + 0.004);
    gain.gain.setValueAtTime(vol, when + dur - 0.01);
    gain.gain.linearRampToValueAtTime(0, when + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    return {
      end: when + dur,
      cancel: () => { try { osc.stop(); } catch { /* déjà arrêté */ } gain.disconnect(); },
    };
  }

  // Mesure la latence aller-retour (haut-parleur → micro) en écoutant le bip.
  // Résultat en ms (médiane de 3 mesures), ou null si le bip n'est pas entendu.
  async measureLatency() {
    if (!(await this.startMic())) return null;
    const results = [];
    for (let i = 0; i < 3; i++) {
      const ambient = this.lastLevel;
      const when = this.now() + 0.3;
      const thr = Math.min(0.5, Math.max(0.05, ambient * 3));
      this._post({ type: 'capture', time: when, threshold: thr });
      this.scheduleBeep(when, { ms: 120 });
      const got = await new Promise((resolve) => {
        const onCap = (e) => { cleanup(); resolve(e.detail.time); };
        const t = setTimeout(() => { cleanup(); resolve(null); }, 1500);
        const cleanup = () => { clearTimeout(t); this.removeEventListener('captured', onCap); };
        this.addEventListener('captured', onCap);
      });
      this._post({ type: 'capture', time: Infinity, threshold: 1 });
      if (got != null) results.push((got - when) * 1000);
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!results.length) return null;
    results.sort((a, b) => a - b);
    return Math.round(results[Math.floor(results.length / 2)]);
  }
}

// Repli pour navigateurs sans AudioWorklet : même logique dans le thread principal.
function createScriptDetector(ctx, emit) {
  const node = ctx.createScriptProcessor(1024, 1, 1);
  const sr = ctx.sampleRate;
  const st = {
    threshold: 0.5, deadFrames: Math.round(0.08 * sr), armFrame: Infinity,
    lastShotFrame: -Infinity, captureFrom: Infinity, captureThreshold: 0.1,
  };
  node.onaudioprocess = (e) => {
    const ch = e.inputBuffer.getChannelData(0);
    const base = Math.round(e.playbackTime * sr);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i]);
      if (v > peak) peak = v;
      const frame = base + i;
      if (v >= st.threshold && frame >= st.armFrame && frame - st.lastShotFrame >= st.deadFrames) {
        st.lastShotFrame = frame;
        emit({ type: 'shot', frame, peak: v });
      }
      if (v >= st.captureThreshold && frame >= st.captureFrom) {
        st.captureFrom = Infinity;
        emit({ type: 'captured', frame });
      }
    }
    emit({ type: 'level', peak });
  };
  return {
    node,
    receive(m) {
      if (m.type === 'config') {
        if (m.threshold != null) st.threshold = m.threshold;
        if (m.deadTime != null) st.deadFrames = Math.round(m.deadTime * sr);
      } else if (m.type === 'arm') { st.armFrame = Math.round(m.time * sr); st.lastShotFrame = -Infinity; }
      else if (m.type === 'disarm') st.armFrame = Infinity;
      else if (m.type === 'capture') { st.captureFrom = Math.round(m.time * sr); st.captureThreshold = m.threshold; }
    },
  };
}

export const engine = new AudioEngine();
