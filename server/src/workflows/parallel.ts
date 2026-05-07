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
 * batched by `maxParallel`, then pass all results plus the original input
 * to `aggregator`.
 *
 * Uses `Promise.allSettled`: individual worker rejections are captured as
 * errors and do NOT abort the batch. The aggregator decides how to handle
 * partial failures.
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
    const allResults: TResult[] = [];
    const allErrors: { item: TItem; error: unknown }[] = [];

    for (let i = 0; i < items.length; i += config.maxParallel) {
      const batch = items.slice(i, i + config.maxParallel);
      const settled = await Promise.allSettled(
        batch.map((item) => worker.execute(item)),
      );

      for (let j = 0; j < settled.length; j++) {
        const s = settled[j];
        if (s.status === "fulfilled") {
          allResults.push(s.value);
        } else {
          allErrors.push({ item: batch[j], error: s.reason });
        }
      }
    }

    return aggregator.execute({ results: allResults, errors: allErrors, items, input });
  });
}
