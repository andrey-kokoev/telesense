/**
 * TV Noise Generators
 * Provides both GPU-accelerated (SVG) and CPU-based (Canvas) noise generation.
 */

export interface NoiseGenerator {
  start(): void
  stop(): void
  destroy(): void
}

export interface GPUOptions {
  baseFrequency?: number
  numOctaves?: number
  slope?: number
  intercept?: number
  discrete?: boolean
}

/**
 * GPU-accelerated noise generator using SVG filters.
 * Uses feTurbulence with hardware acceleration.
 */
export class GPUNoiseGenerator implements NoiseGenerator {
  private svg: SVGSVGElement
  private turbulence: SVGFETurbulenceElement
  private rafId: number | null = null
  private seed = 0
  private running = false

  constructor(container: HTMLElement, options: GPUOptions = {}) {
    const {
      baseFrequency = 0.3,
      numOctaves = 1,
      slope = 5,
      intercept = -1.0,
      discrete = true,
    } = options

    // Create SVG element
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    this.svg.setAttribute("width", "100%")
    this.svg.setAttribute("height", "100%")
    this.svg.style.position = "absolute"
    this.svg.style.inset = "0"

    // Create defs and filter
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs")
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter")
    filter.setAttribute("id", "tv-noise-" + Math.random().toString(36).slice(2))
    filter.setAttribute("x", "0")
    filter.setAttribute("y", "0")
    filter.setAttribute("width", "100%")
    filter.setAttribute("height", "100%")

    // Create turbulence filter
    this.turbulence = document.createElementNS("http://www.w3.org/2000/svg", "feTurbulence")
    this.turbulence.setAttribute("type", "fractalNoise")
    this.turbulence.setAttribute("baseFrequency", baseFrequency.toString())
    this.turbulence.setAttribute("numOctaves", numOctaves.toString())
    this.turbulence.setAttribute("seed", "0")
    this.turbulence.setAttribute("result", "noise")

    // Desaturate
    const colorMatrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix")
    colorMatrix.setAttribute("type", "saturate")
    colorMatrix.setAttribute("values", "0")
    colorMatrix.setAttribute("in", "noise")
    colorMatrix.setAttribute("result", "gray")

    // Contrast crush
    const componentTransfer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "feComponentTransfer",
    )
    componentTransfer.setAttribute("in", "gray")
    componentTransfer.setAttribute("result", "crushed")

    const funcR = document.createElementNS("http://www.w3.org/2000/svg", "feFuncR")
    funcR.setAttribute("type", "linear")
    funcR.setAttribute("slope", slope.toString())
    funcR.setAttribute("intercept", intercept.toString())

    const funcG = document.createElementNS("http://www.w3.org/2000/svg", "feFuncG")
    funcG.setAttribute("type", "linear")
    funcG.setAttribute("slope", slope.toString())
    funcG.setAttribute("intercept", intercept.toString())

    const funcB = document.createElementNS("http://www.w3.org/2000/svg", "feFuncB")
    funcB.setAttribute("type", "linear")
    funcB.setAttribute("slope", slope.toString())
    funcB.setAttribute("intercept", intercept.toString())

    componentTransfer.appendChild(funcR)
    componentTransfer.appendChild(funcG)
    componentTransfer.appendChild(funcB)

    // Assemble filter
    filter.appendChild(this.turbulence)
    filter.appendChild(colorMatrix)
    filter.appendChild(componentTransfer)

    // Optional discrete step for 1-bit look
    if (discrete) {
      const discreteTransfer = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "feComponentTransfer",
      )
      const discreteR = document.createElementNS("http://www.w3.org/2000/svg", "feFuncR")
      discreteR.setAttribute("type", "discrete")
      discreteR.setAttribute("tableValues", "0 1")
      const discreteG = document.createElementNS("http://www.w3.org/2000/svg", "feFuncG")
      discreteG.setAttribute("type", "discrete")
      discreteG.setAttribute("tableValues", "0 1")
      const discreteB = document.createElementNS("http://www.w3.org/2000/svg", "feFuncB")
      discreteB.setAttribute("type", "discrete")
      discreteB.setAttribute("tableValues", "0 1")
      discreteTransfer.appendChild(discreteR)
      discreteTransfer.appendChild(discreteG)
      discreteTransfer.appendChild(discreteB)
      filter.appendChild(discreteTransfer)
    }

    defs.appendChild(filter)
    this.svg.appendChild(defs)

    // Create rect that uses the filter
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    rect.setAttribute("width", "100%")
    rect.setAttribute("height", "100%")
    rect.style.filter = `url(#${filter.getAttribute("id")})`
    this.svg.appendChild(rect)

    container.appendChild(this.svg)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.animate()
  }

  stop(): void {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private animate(): void {
    if (!this.running) return
    this.seed = (this.seed + 1) % 1000
    this.turbulence.setAttribute("seed", this.seed.toString())
    this.rafId = requestAnimationFrame(() => this.animate())
  }

  destroy(): void {
    this.stop()
    this.svg.remove()
  }
}

export interface CPUOptions {
  width?: number
  height?: number
}

/**
 * CPU-based noise generator using Canvas pixel manipulation.
 * Directly manipulates pixel buffer for static noise effect.
 */
export class CPUNoiseGenerator implements NoiseGenerator {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private imgData: ImageData
  private buf32: Uint32Array
  private rafId: number | null = null
  private running = false
  private resizeHandler: () => void

  constructor(container: HTMLElement, options: CPUOptions = {}) {
    const { width = container.clientWidth, height = container.clientHeight } = options

    // Create canvas
    this.canvas = document.createElement("canvas")
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.style.position = "absolute"
    this.canvas.style.inset = "0"
    this.canvas.style.width = "100%"
    this.canvas.style.height = "100%"
    this.canvas.style.imageRendering = "pixelated"

    const ctx = this.canvas.getContext("2d", { alpha: false })
    if (!ctx) {
      throw new Error("Failed to get 2D context")
    }
    this.ctx = ctx

    // Initialize pixel buffer
    this.imgData = this.ctx.createImageData(this.canvas.width, this.canvas.height)
    this.buf32 = new Uint32Array(this.imgData.data.buffer)

    // Handle resize
    this.resizeHandler = () => this.resize()
    window.addEventListener("resize", this.resizeHandler)

    container.appendChild(this.canvas)
  }

  private resize(): void {
    this.canvas.width = this.canvas.parentElement?.clientWidth || window.innerWidth
    this.canvas.height = this.canvas.parentElement?.clientHeight || window.innerHeight
    this.imgData = this.ctx.createImageData(this.canvas.width, this.canvas.height)
    this.buf32 = new Uint32Array(this.imgData.data.buffer)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.animate()
  }

  stop(): void {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private animate(): void {
    if (!this.running) return

    // Fill with random grayscale values
    // 0xFF000000 = alpha channel (255), then BGR channels
    for (let i = 0; i < this.buf32.length; i++) {
      const v = (Math.random() * 255) | 0
      this.buf32[i] = 0xff000000 | (v << 16) | (v << 8) | v
    }

    this.ctx.putImageData(this.imgData, 0, 0)
    this.rafId = requestAnimationFrame(() => this.animate())
  }

  destroy(): void {
    this.stop()
    window.removeEventListener("resize", this.resizeHandler)
    this.canvas.remove()
  }
}

/**
 * Create a scanlines overlay element.
 * Uses CSS-only rendering for performance.
 */
export function createScanlinesOverlay(container: HTMLElement): HTMLElement {
  const scanlines = document.createElement("div")
  scanlines.style.position = "absolute"
  scanlines.style.inset = "0"
  scanlines.style.background = `repeating-linear-gradient(
    0deg,
    rgba(0,0,0,0.15),
    rgba(0,0,0,0.15) 1px,
    transparent 1px,
    transparent 2px
  )`
  scanlines.style.pointerEvents = "none"
  container.appendChild(scanlines)
  return scanlines
}

/**
 * Create a "No Signal" text overlay.
 */
export function createNoSignalOverlay(container: HTMLElement): HTMLElement {
  const nosignal = document.createElement("div")
  nosignal.textContent = "NO SIGNAL"
  nosignal.style.position = "absolute"
  nosignal.style.inset = "0"
  nosignal.style.display = "flex"
  nosignal.style.alignItems = "center"
  nosignal.style.justifyContent = "center"
  nosignal.style.fontSize = "clamp(24px, 5vw, 64px)"
  nosignal.style.letterSpacing = "0.2em"
  nosignal.style.color = "rgba(255,255,255,0.8)"
  nosignal.style.textShadow = "2px 2px 0 rgba(0,0,0,0.8)"
  nosignal.style.pointerEvents = "none"
  nosignal.style.mixBlendMode = "difference"
  container.appendChild(nosignal)
  return nosignal
}
