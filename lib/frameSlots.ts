export interface FrameAsset { id: number; src: string; name: string; contentType?: string }
export type FrameSlot = 0 | 1;
export type FramePair = [FrameAsset | null, FrameAsset | null];
export interface FrameSnapshot { slots: FramePair; uploading: [boolean, boolean] }
export function orderedFrameIds(slots: FramePair): number[] | null {
  return slots[0] && slots[1] ? [slots[0].id, slots[1].id] : null;
}

/** Async uploads belong to an exact slot revision and mounted card session. */
export class FrameSlots {
  private slots: FramePair = [null, null];
  private revisions = [0, 0];
  private uploading: [boolean, boolean] = [false, false];
  private alive = true;
  snapshot(): FrameSnapshot { return { slots: [...this.slots], uploading: [...this.uploading] }; }
  activate() { this.alive = true; }
  dispose() { this.alive = false; this.revisions = this.revisions.map(v => v + 1); this.uploading = [false, false]; }
  select(slot: FrameSlot, asset: FrameAsset | null) {
    this.revisions[slot]++; this.uploading[slot] = false; this.slots[slot] = asset;
  }
  swap() {
    this.revisions = this.revisions.map(v => v + 1);
    this.uploading = [false, false]; this.slots = [this.slots[1], this.slots[0]];
  }
  begin(slot: FrameSlot): number { this.uploading[slot] = true; return ++this.revisions[slot]; }
  current(slot: FrameSlot, revision: number) { return this.alive && this.revisions[slot] === revision; }
  finish(slot: FrameSlot, revision: number, asset?: FrameAsset): boolean {
    if (!this.current(slot, revision)) return false;
    this.uploading[slot] = false; if (asset) this.slots[slot] = asset;
    return true;
  }
}
