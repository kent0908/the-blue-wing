/** Tracks the exact edit revision acknowledged by the server. */
export class CanvasSaveState {
  revision = 0;
  savedRevision = 0;
  saving = false;
  constructor(public version: string) {}
  get dirty() { return this.revision !== this.savedRevision; }
  edit() { this.revision++; }
  async save(send: (version: string) => Promise<{ version: string }>) {
    if (this.saving) return;
    this.saving = true;
    const revision = this.revision;
    try {
      const result = await send(this.version);
      if (typeof result.version !== "string" || !result.version) throw new Error("伺服器未確認儲存版本，請重新載入前先匯出草稿");
      this.version = result.version;
      this.savedRevision = revision;
    } finally { this.saving = false; }
  }
}
export class CanvasRunLock {
  busy = false;
  async run(task: () => Promise<void>) {
    if (this.busy) return false;
    this.busy = true;
    try { await task(); return true; } finally { this.busy = false; }
  }
}
