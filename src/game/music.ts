import Phaser from 'phaser';
import { MUSIC_LOOPS } from '../art';

// Music that plays its intro once, then repeats a loop section forever (the outro is never
// heard). Loop points come from assets/day/day.json ("loop": [start, end] in seconds). The loop
// is done by Web Audio itself, so it is sample-accurate with no gap. It follows the sound
// manager's pauseAll/resumeAll (the pause button), picking up exactly where it stopped. Tracks
// without loop points, or browsers without Web Audio, fall back to Phaser's whole-file loop.

export class Music {
  private manager: Phaser.Sound.BaseSoundManager;
  private ctx?: AudioContext;
  private buffer?: AudioBuffer;
  private loop: [number, number] = [0, 0];
  private node?: AudioBufferSourceNode;
  private gain?: GainNode;
  /** Context time at which the track's position 0 would have played. */
  private t0 = 0;
  private pausedAt: number | null = null;
  private plain?: Phaser.Sound.BaseSound;

  constructor(scene: Phaser.Scene, key: string, volume: number) {
    this.manager = scene.sound;
    const loop = MUSIC_LOOPS[key];
    const buffer = scene.cache.audio.get(key);
    if (loop && this.manager instanceof Phaser.Sound.WebAudioSoundManager && buffer instanceof AudioBuffer) {
      this.ctx = this.manager.context;
      this.buffer = buffer;
      this.loop = [loop[0], Math.min(loop[1], buffer.duration)];
      this.gain = this.ctx.createGain();
      this.gain.gain.value = volume;
      this.gain.connect(this.manager.destination);
      this.startAt(0);
      this.manager.on(Phaser.Sound.Events.PAUSE_ALL, this.pause, this);
      this.manager.on(Phaser.Sound.Events.RESUME_ALL, this.resume, this);
      return;
    }
    this.plain = this.manager.add(key, { loop: true, volume });
    this.plain.play();
  }

  private startAt(offset: number): void {
    const node = this.ctx!.createBufferSource();
    node.buffer = this.buffer!;
    node.loop = true;
    node.loopStart = this.loop[0];
    node.loopEnd = this.loop[1];
    node.connect(this.gain!);
    node.start(0, offset);
    this.node = node;
    this.t0 = this.ctx!.currentTime - offset;
  }

  /** Where in the track playback is now, folded back into the loop once past its end. */
  private position(): number {
    const t = this.ctx!.currentTime - this.t0;
    const [a, b] = this.loop;
    return t < b ? t : a + ((t - a) % (b - a));
  }

  private killNode(): void {
    if (!this.node) return;
    try {
      this.node.stop();
    } catch {
      // already stopped
    }
    this.node.disconnect();
    this.node = undefined;
  }

  private pause(): void {
    if (!this.node) return;
    this.pausedAt = this.position();
    this.killNode();
  }

  private resume(): void {
    if (this.pausedAt === null || !this.gain) return;
    this.startAt(this.pausedAt);
    this.pausedAt = null;
  }

  /** Tweenable, like a Phaser sound's volume. */
  get volume(): number {
    if (this.gain) return this.gain.gain.value;
    return (this.plain as Phaser.Sound.WebAudioSound | undefined)?.volume ?? 0;
  }

  set volume(v: number) {
    if (this.gain) this.gain.gain.value = v;
    else if (this.plain) (this.plain as Phaser.Sound.WebAudioSound).volume = v;
  }

  stop(): void {
    this.manager.off(Phaser.Sound.Events.PAUSE_ALL, this.pause, this);
    this.manager.off(Phaser.Sound.Events.RESUME_ALL, this.resume, this);
    this.killNode();
    this.gain?.disconnect();
    this.gain = undefined;
    this.pausedAt = null;
    this.plain?.stop();
    this.plain?.destroy();
    this.plain = undefined;
  }
}
