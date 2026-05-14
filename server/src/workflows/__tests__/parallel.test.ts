import { describe, it, expect } from "vitest";
import { node } from "../node.js";
import { parallel, ParallelAggregatorInput } from "../parallel.js";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Flush the microtask queue so any pending continuations run before assertions.
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(() => resolve()));

describe("parallel", () => {
  it("Scenario: processes every item and preserves input order in results", async () => {
    const worker = node(async (n: number) => n * 10);
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 2,
      itemsKey: "items",
    });
    const out = await wf.execute({ items: [1, 2, 3, 4, 5] });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("Scenario: result order matches item order regardless of completion order", async () => {
    const items = [0, 1, 2, 3];
    const gates = items.map(() => deferred<void>());
    const worker = node(async (i: number) => {
      await gates[i].promise;
      return i * 100;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 4,
      itemsKey: "items",
    });

    const p = wf.execute({ items });
    // Resolve in reverse order.
    gates[3].resolve();
    gates[2].resolve();
    gates[1].resolve();
    gates[0].resolve();
    expect(await p).toEqual([0, 100, 200, 300]);
  });

  it("Scenario: per-item errors are captured without aborting other items", async () => {
    const worker = node(async (i: number) => {
      if (i % 2 === 0) throw new Error(`fail-${i}`);
      return i * 10;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 3,
      itemsKey: "items",
    });
    const out = await wf.execute({ items: [0, 1, 2, 3, 4] });

    expect(out.results).toEqual([10, 30]);
    expect(out.errors).toHaveLength(3);
    expect(out.errors.map((e) => e.item)).toEqual([0, 2, 4]);
    expect((out.errors[0].error as Error).message).toBe("fail-0");
    expect((out.errors[1].error as Error).message).toBe("fail-2");
    expect((out.errors[2].error as Error).message).toBe("fail-4");
  });

  it("Scenario: empty items array yields empty results and errors without invoking the worker", async () => {
    let workerCalls = 0;
    const worker = node(async (n: number) => {
      workerCalls++;
      return n;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => ({
        resultsLen: agg.results.length,
        errorsLen: agg.errors.length,
        itemsLen: agg.items.length,
      }),
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 4,
      itemsKey: "items",
    });
    const out = await wf.execute({ items: [] });
    expect(out).toEqual({ resultsLen: 0, errorsLen: 0, itemsLen: 0 });
    expect(workerCalls).toBe(0);
  });

  it("Scenario: aggregator receives the original input, items, results and errors", async () => {
    type Input = { items: number[]; ctx: string };
    const worker = node(async (n: number) => n + 1);
    const aggregator = node(
      async (agg: ParallelAggregatorInput<number, number, Input>) => agg,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 2,
      itemsKey: "items",
    });
    const input: Input = { items: [10, 20, 30], ctx: "trace-1" };
    const out = await wf.execute(input);

    expect(out.input).toBe(input);
    expect(out.items).toEqual([10, 20, 30]);
    expect(out.results).toEqual([11, 21, 31]);
    expect(out.errors).toEqual([]);
  });

  it("Scenario: never exceeds maxParallel workers in flight at the same time", async () => {
    const items = [0, 1, 2, 3, 4, 5];
    const gates = items.map(() => deferred<void>());
    let active = 0;
    let peak = 0;

    const worker = node(async (i: number) => {
      active++;
      peak = Math.max(peak, active);
      await gates[i].promise;
      active--;
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 2,
      itemsKey: "items",
    });

    const p = wf.execute({ items });
    await flush();
    expect(active).toBe(2);

    // Release items one by one; a fresh slot should pick the next item each time.
    for (const g of gates) {
      g.resolve();
      await flush();
    }

    await p;
    expect(peak).toBe(2);
  });

  it("Scenario: slot count is capped at items.length when maxParallel exceeds items", async () => {
    let active = 0;
    let peak = 0;
    const gate = deferred<void>();

    const worker = node(async (i: number) => {
      active++;
      peak = Math.max(peak, active);
      await gate.promise;
      active--;
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 10,
      itemsKey: "items",
    });

    const p = wf.execute({ items: [1, 2] });
    await flush();
    expect(active).toBe(2); // not 10
    gate.resolve();
    await p;
    expect(peak).toBe(2);
  });

  it("Scenario: a finished slot immediately picks up the next pending item (no batch waiting)", async () => {
    const items = [0, 1, 2, 3];
    const gates = items.map(() => deferred<void>());
    const started: number[] = [];

    const worker = node(async (i: number) => {
      started.push(i);
      await gates[i].promise;
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 2,
      itemsKey: "items",
    });

    const p = wf.execute({ items });
    await flush();
    // Two slots claim items 0 and 1 up front.
    expect(started).toEqual([0, 1]);

    // Finish item 0; the freed slot should pick up item 2 even though item 1 is still pending.
    gates[0].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);

    // Finish item 2; slot picks up item 3 while item 1 is still pending.
    gates[2].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);

    // Drain.
    gates[1].resolve();
    gates[3].resolve();
    expect(await p).toEqual([0, 1, 2, 3]);
  });

  it("Scenario: maxParallel=1 serializes execution (no overlap between items)", async () => {
    const trace: string[] = [];
    const worker = node(async (i: number) => {
      trace.push(`start-${i}`);
      await Promise.resolve();
      await Promise.resolve();
      trace.push(`end-${i}`);
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg.results,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 1,
      itemsKey: "items",
    });

    await wf.execute({ items: [1, 2, 3] });
    expect(trace).toEqual([
      "start-1",
      "end-1",
      "start-2",
      "end-2",
      "start-3",
      "end-3",
    ]);
  });

  it("Scenario: itemsKey selects the property holding the items array", async () => {
    type Input = { pages: string[]; meta: number };
    const worker = node(async (s: string) => s.toUpperCase());
    const aggregator = node(
      async (agg: ParallelAggregatorInput<string, string, Input>) =>
        agg.results,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 2,
      itemsKey: "pages",
    });
    const out = await wf.execute({ pages: ["a", "b", "c"], meta: 1 });
    expect(out).toEqual(["A", "B", "C"]);
  });

  it("Scenario: aggregator's return value is the workflow's output", async () => {
    const worker = node(async (n: number) => n);
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => ({
        sum: agg.results.reduce((acc, v) => acc + v, 0),
        count: agg.items.length,
      }),
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 3,
      itemsKey: "items",
    });
    const out = await wf.execute({ items: [1, 2, 3, 4] });
    expect(out).toEqual({ sum: 10, count: 4 });
  });

  it("Scenario: errors array preserves item-index order of failures", async () => {
    const worker = node(async (i: number) => {
      if (i === 1 || i === 3) throw new Error(`x-${i}`);
      return i;
    });
    const aggregator = node(
      async (
        agg: ParallelAggregatorInput<number, number, { items: number[] }>,
      ) => agg,
    );
    const wf = parallel(worker, aggregator, {
      maxParallel: 4,
      itemsKey: "items",
    });
    const out = await wf.execute({ items: [0, 1, 2, 3, 4] });
    expect(out.results).toEqual([0, 2, 4]);
    expect(out.errors.map((e) => e.item)).toEqual([1, 3]);
  });
});
