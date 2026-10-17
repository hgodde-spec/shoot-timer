// Déroulé d'une série : attente (délai) → bip → écoute → arrêt.
// Événements : 'state' (waiting|running|stopped|cancelled), 'beep', 'shot', 'tick', 'done'.

import { engine } from '../audio/engine.js';
import { getSettings } from '../settings.js';
import { keepAwake } from './wakelock.js';

const ARM_MARGIN = 0.03;   // marge après la fin du bip avant d'accepter un tir (s)
const MAX_DURATION = 120;  // sécurité : arrêt après 2 min

export class TimerRun extends EventTarget {
  constructor({ expected = null, par = null, delay }) {
    super();
    this.expected = expected;
    this.par = par;
    this.delay = delay;
    this.state = 'idle';
    this.shots = [];
    this.beepTime = null;
    this.autoStopAt = null;
    this._raf = null;
    this._onShot = (e) => this._micShot(e.detail);
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _setState(s) { this.state = s; this._emit('state', s); }

  start() {
    const { min, max, mode } = this.delay;
    const d = mode === 'fixed' ? min : min + Math.random() * Math.max(0, max - min);
    this.beepTime = engine.now() + d;
    this.beep = engine.scheduleBeep(this.beepTime);
    engine.arm(this.beep.end + ARM_MARGIN);
    engine.addEventListener('shot', this._onShot);
    keepAwake(true);
    this._setState('waiting');
    this._loop();
  }

  elapsed() { return this.beepTime == null ? 0 : engine.now() - this.beepTime; }

  _loop = () => {
    const now = engine.now();
    if (this.state === 'waiting' && now >= this.beepTime) {
      this._setState('running');
      this._emit('beep');
    }
    if (this.state === 'running') {
      this._emit('tick', now - this.beepTime);
      if (this.autoStopAt != null && now >= this.autoStopAt) return this.stop();
      if (now - this.beepTime > MAX_DURATION) return this.stop();
    }
    if (this.state === 'waiting' || this.state === 'running') this._raf = requestAnimationFrame(this._loop);
  };

  _micShot({ time, peak }) {
    if (this.state !== 'running' && this.state !== 'waiting') return;
    const t = time - this.beepTime - getSettings().latencyMs / 1000;
    this._addShot({ t: Math.max(0, t), peak });
  }

  // Bouton « Tir simulé » : horodaté sur l'horloge audio, sans correction de latence.
  simulateShot() {
    if (this.state !== 'running') return;
    this._addShot({ t: engine.now() - this.beepTime, peak: null, simulated: true });
  }

  _addShot(shot) {
    this.shots.push({ ...shot, parasite: false });
    this._emit('shot', shot);
    const s = getSettings();
    if (s.autoStop && this.expected && this.shots.length >= this.expected && this.autoStopAt == null) {
      this.autoStopAt = engine.now() + s.autoStopDelayMs / 1000;
    }
  }

  get active() { return this.state === 'waiting' || this.state === 'running'; }

  _release() {
    cancelAnimationFrame(this._raf);
    engine.removeEventListener('shot', this._onShot);
    engine.disarm();
    keepAwake(false);
  }

  // Abandon silencieux (on quitte l'écran) : aucun événement émis.
  abort() {
    if (!this.active) return;
    this._release();
    if (this.state === 'waiting') this.beep.cancel();
    this.state = 'aborted';
  }

  stop() {
    if (!this.active) return;
    this._release();
    if (this.state === 'waiting') {
      this.beep.cancel();
      this._setState('cancelled');
      return;
    }
    this.duration = engine.now() - this.beepTime;
    this._setState('stopped');
    this._emit('done', this.shots);
  }
}
