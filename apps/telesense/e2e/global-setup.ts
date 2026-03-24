import type { FullConfig } from "@playwright/test"
import net from "node:net"

type PortCheck = {
  host: string
  label: string
  port: number
}

const REQUIRED_PORTS: PortCheck[] = [
  {
    host: "127.0.0.1",
    port: 5173,
    label: "Vite dev server",
  },
  {
    host: "127.0.0.1",
    port: 8787,
    label: "Worker backend",
  },
]

function assertPortOpen({ host, port, label }: PortCheck): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()

    const fail = (reason: string) => {
      socket.destroy()
      reject(new Error(`[e2e preflight] ${label} is not reachable at ${host}:${port}: ${reason}`))
    }

    socket.setTimeout(1_500)
    socket.once("connect", () => {
      socket.end()
      resolve()
    })
    socket.once("timeout", () => fail("timeout"))
    socket.once("error", (error) => fail(error.message))
    socket.connect(port, host)
  })
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await Promise.all(REQUIRED_PORTS.map(assertPortOpen))
}
