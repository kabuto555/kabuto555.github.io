// AudioAnalyser: connects an <audio> element to the Web Audio API and exposes
// a real-time energy scalar suitable for driving beat-reactive animations.
//
// getEnergy() — smoothed RMS of the full spectrum (0–1), good for continuous
//               amplitude-following (scale pulse, brightness).
// getBeat()   — peak-hold envelope that punches hard on transients and decays
//               quickly; good for discrete "hit" reactions (bounce, flash).

export class AudioAnalyser {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> = new Uint8Array(0) as Uint8Array<ArrayBuffer>;

  // Smoothed values
  private smoothEnergy = 0;
  private beatEnvelope = 0;
  private peakHold     = 0;

  // Connect to an <audio> element (call once after first user gesture)
  connect(audio: HTMLAudioElement): void {
    if (this.ctx) return; // already connected
    try {
      this.ctx = new AudioContext();
      const source = this.ctx.createMediaElementSource(audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;          // 128 frequency bins
      this.analyser.smoothingTimeConstant = 0.6;
      source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {
      // Web Audio unavailable — graceful degrade, values stay 0
    }
  }

  /** Resume AudioContext if suspended (required after user gesture on some browsers) */
  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  /**
   * Call once per frame. Updates internal state from the analyser.
   * @param dt frame delta-time in seconds
   */
  update(dt: number): void {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.data);

    // Bass-weighted RMS: weight lower bins more heavily (kick/snare live there)
    // Bins 0–15 ≈ 0–1.5 kHz at 44.1 kHz sample rate with fftSize=256
    let sum = 0;
    let weightSum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const w = Math.max(0.1, 1 - i / (this.data.length * 0.6)); // bass-heavy weight
      sum += (this.data[i] / 255) * w;
      weightSum += w;
    }
    const raw = sum / weightSum;

    // Smooth energy: fast attack, slow release (envelope follower)
    const attackK  = 1 - Math.exp(-dt * 30);  // ~33ms attack
    const releaseK = 1 - Math.exp(-dt * 4);   // ~250ms release
    if (raw > this.smoothEnergy) {
      this.smoothEnergy += (raw - this.smoothEnergy) * attackK;
    } else {
      this.smoothEnergy += (raw - this.smoothEnergy) * releaseK;
    }

    // Beat envelope: punch on transient, decay quickly
    // A transient = current raw significantly exceeds the smoothed level
    const transient = Math.max(0, raw - this.smoothEnergy * 0.7);
    if (transient > this.peakHold) {
      this.peakHold = transient;
      this.beatEnvelope = Math.min(1, transient * 3.5);
    }
    // Decay peak hold
    this.peakHold     *= Math.exp(-dt * 8);
    this.beatEnvelope *= Math.exp(-dt * 12); // fast decay = snappy beat feel
  }

  /** Smoothed amplitude energy, 0–1. Good for continuous pulse. */
  getEnergy(): number { return this.smoothEnergy; }

  /** Transient beat envelope, 0–1. Punches on hits, decays quickly. */
  getBeat(): number { return this.beatEnvelope; }
}
