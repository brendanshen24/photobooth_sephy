declare module "nfc-pcsc" {
  import { EventEmitter } from "node:events";

  export type Card = {
    type?: string;
    standard?: string;
    uid?: string;
    atr?: Buffer;
    data?: Buffer;
  };

  export class Reader extends EventEmitter {
    name: string;
    autoProcessing: boolean;
    aid: string | Buffer | ((card: Card) => Buffer);
    on(event: "card", listener: (card: Card) => void): this;
    on(event: "card.off", listener: (card: Card) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "end", listener: () => void): this;
    read(
      blockNumber: number,
      length: number,
      blockSize?: number,
      packetSize?: number,
      readClass?: number
    ): Promise<Buffer>;
    transmit(data: Buffer, responseMaxLength: number): Promise<Buffer>;
    control?(data: Buffer, responseMaxLength: number): Promise<Buffer>;
    led?(led: number, blinking: number[]): Promise<void>;
    close(): void;
  }

  export class NFC extends EventEmitter {
    constructor(logger?: unknown);
    on(event: "reader", listener: (reader: Reader) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
  }
}
