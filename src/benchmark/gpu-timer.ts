type TimerQueryExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

export class GpuTimer {
  private readonly extension: TimerQueryExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private activeQuery: WebGLQuery | null = null;
  private readonly maxPendingQueries = 8;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExtension | null;
  }

  get supported(): boolean { return this.extension !== null; }
  get pendingCount(): number { return this.pending.length; }

  begin(): void {
    if (!this.extension || this.activeQuery || this.pending.length >= this.maxPendingQueries) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.activeQuery = query;
  }

  end(): void {
    if (!this.extension || !this.activeQuery) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.activeQuery);
    this.activeQuery = null;
  }

  poll(): number | null {
    if (!this.extension || this.pending.length === 0) return null;
    const query = this.pending[0];
    if (!query || !this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) return null;
    const disjoint = Boolean(this.gl.getParameter(this.extension.GPU_DISJOINT_EXT));
    if (disjoint) {
      this.clearPending();
      return null;
    }
    this.pending.shift();
    const elapsedNanoseconds = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT));
    this.gl.deleteQuery(query);
    const elapsedMilliseconds = elapsedNanoseconds / 1_000_000;
    return Number.isFinite(elapsedMilliseconds) && elapsedMilliseconds >= 0 && elapsedMilliseconds < 10_000
      ? elapsedMilliseconds
      : null;
  }

  reset(): void {
    if (this.activeQuery && this.extension) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.gl.deleteQuery(this.activeQuery);
      this.activeQuery = null;
    }
    this.clearPending();
  }

  private clearPending(): void {
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending.length = 0;
  }

  dispose(): void { this.reset(); }
}
