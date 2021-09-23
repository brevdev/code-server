import internal from "stream"

declare module "http" {
  interface IncomingMessage {
    ws: internal.Duplex
    head: Buffer
    _ws_handled: boolean
  }
}
