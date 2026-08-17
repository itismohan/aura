import { EventEmitter } from "node:events";

const bus = new EventEmitter();
bus.setMaxListeners(0);

export type LiveScanEvent = {
  scanJobId: number;
  stage: string;
  message: string;
  progress: number;
  status?: "completed" | "failed" | "cancelled";
};

export function publishScanEvent(event: LiveScanEvent) {
  bus.emit(`scan:${event.scanJobId}`, event);
}

export function subscribeScanEvents(scanJobId: number, listener: (event: LiveScanEvent) => void) {
  const channel = `scan:${scanJobId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
