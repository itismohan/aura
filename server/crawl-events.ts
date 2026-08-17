import { EventEmitter } from "node:events";
import type { CrawlRuntimeEvent } from "./crawl-runner";

const bus = new EventEmitter();
bus.setMaxListeners(0);

export type LiveCrawlEvent = CrawlRuntimeEvent & { sessionId: number };

export function publishCrawlEvent(event: LiveCrawlEvent) {
  bus.emit(`crawl:${event.sessionId}`, event);
}

export function subscribeCrawlEvents(sessionId: number, listener: (event: LiveCrawlEvent) => void) {
  const channel = `crawl:${sessionId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
