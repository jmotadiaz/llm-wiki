import { WorkflowNode, node } from "./node.js";

export interface ParallelConfig<K extends string = string> {
  /** Maximum number of concurrent executions. */
  maxParallel: number;
  /** Name of the property on the input object that holds the items array. */
  itemsKey: K;
}

export interface ParallelAggregatorInput<TResult, TItem, TInput> {
  /** Successfully resolved results, in the same order as items. */
  results: TResult[];
  /** Errors captured from rejected worker executions. */
  errors: { item: TItem; error: unknown }[];
  /** The original items array. */
  items: TItem[];
  /** The original input passed to parallel.execute(). */
  input: TInput;
}

/**
 * Execute `worker` on every item found at `config.itemsKey` on the input,
 * with at most `maxParallel` executions in flight at any time, then pass
 * all results plus the original input to `aggregator`.
 *
 * Concurrency model: a fixed pool of `min(maxParallel, items.length)`
 * slots pulls items from a shared cursor. As soon as one slot finishes
 * an item, it picks up the next one — no batch boundaries, no waiting
 * for the slowest item of a batch before the next item starts.
 *
 * Individual worker rejections are captured as errors and do NOT abort
 * the run. The aggregator decides how to handle partial failures.
 *
 * Result ordering: `results` and `errors` are emitted in the same order
 * as the original `items` array (failures excluded from `results`,
 * successes excluded from `errors`).
 *
 * @example
 *   parallel(writerNode, metaNode, { maxParallel: 3, itemsKey: "pages" })
 */
export function parallel<
  TItem,
  TResult,
  TAggregated,
  TInput extends Record<K, TItem[]>,
  K extends string,
>(
  worker: WorkflowNode<TItem, TResult>,
  aggregator: WorkflowNode<
    ParallelAggregatorInput<TResult, TItem, TInput>,
    TAggregated
  >,
  config: ParallelConfig<K>,
): WorkflowNode<TInput, TAggregated> {
  return node(async (input: TInput): Promise<TAggregated> => {
    const items: TItem[] = input[config.itemsKey];
    const outcomes: PromiseSettledResult<TResult>[] = new Array(items.length);
    let nextIndex = 0;

    const runSlot = async (): Promise<void> => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) return;
        try {
          outcomes[i] = {
            status: "fulfilled",
            value: await worker.execute(items[i]),
          };
        } catch (error) {
          outcomes[i] = { status: "rejected", reason: error };
        }
      }
    };

    const slotCount = Math.min(config.maxParallel, items.length);
    await Promise.all(
      Array.from({ length: slotCount }, () => runSlot()),
    );

    const results: TResult[] = [];
    const errors: { item: TItem; error: unknown }[] = [];
    for (let i = 0; i < items.length; i++) {
      const o = outcomes[i];
      if (o.status === "fulfilled") {
        results.push(o.value);
      } else {
        errors.push({ item: items[i], error: o.reason });
      }
    }

    return aggregator.execute({ results, errors, items, input });
  });
}
