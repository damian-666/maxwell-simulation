import { IKernelFunctionThis } from "gpu.js"

export function getAt(field: number[][], shapeX: number, shapeY: number, x: number, y: number) {
    if (x < 0 || x >= shapeX || y < 0 || y >= shapeY) {
        return 0
    }

    return field[y][x]
}

export function nativeSmoothStep(x: number) {
    return (x <= 0 ? 0 : (x >= 1 ? 1 : 3 * x * x - 2 * x * x * x))
}

export function drawGpu(this: IKernelFunctionThis, electricFieldX: number[][], electricFieldY: number[][], electricFieldZ: number[][],
    magneticFieldX: number[][], magneticFieldY: number[][], magneticFieldZ: number[][],
    permittivity: number[][], permeability: number[][], conductivity: number[][], gridSize: number[], cellSize: number) {
    const gx = gridSize[0]
    const gy = gridSize[1]

    const x = gx * this.thread.x! / (this.output.x as number)
    const y = gy * (1 - this.thread.y! / (this.output.y as number))

    // Make brighter for finer grids. As there are more cells, the energy is spread out instead
    // of concentrated in less cells so we need to make it brighter.
    const fieldBrightness = (0.02 * 0.02) / (cellSize * cellSize)

    const eX = getAt(electricFieldX, gx, gy, x, y)
    const eY = getAt(electricFieldY, gx, gy, x, y)
    const eZ = getAt(electricFieldZ, gx, gy, x, y)
    const eEnergy = fieldBrightness * fieldBrightness * (eX * eX + eY * eY + eZ * eZ)

    // Magnetic field is offset from electric field, so get value at -0.5 by interpolating 0 and 1
    const mX = getAt(magneticFieldX, gx, gy, x - 0.5, y - 0.5)
    const mY = getAt(magneticFieldY, gx, gy, x - 0.5, y - 0.5)
    const mZ = getAt(magneticFieldZ, gx, gy, x - 0.5, y - 0.5)
    const mEnergy = fieldBrightness * fieldBrightness * (mX * mX + mY * mY + mZ * mZ)

    // Material constants are between 1 and 100, map to [0, 1] using tanh(0.5 * (x-1))
    const permittivityValue = (2 / (1 + Math.exp(-0.5 * (getAt(permittivity, gx, gy, x, y) - 1))) - 1)
    const permeabilityValue = (2 / (1 + Math.exp(-0.5 * (getAt(permeability, gx, gy, x, y) - 1))) - 1)

    // Display material as circles. Permittivity and permeability are offset circles from each other.
    const tileFactorX = Math.min(1, 1 / Math.round(2 * gx / this.output.x))
    const tileFactorY = Math.min(1, 1 / Math.round(2 * gy / this.output.y!))

    const dxPermittivity = ((tileFactorX * x) % 1) - 0.5
    const dyPermittivity = ((tileFactorY * y) % 1) - 0.5

    const circleDistPermittivity = (dxPermittivity * dxPermittivity + dyPermittivity * dyPermittivity) * Math.sqrt(2 * Math.PI)

    const dxPermeability = ((tileFactorX * x + 0.5) % 1) - 0.5
    const dyPermeability = ((tileFactorY * y + 0.5) % 1) - 0.5
    const circleDistPermeability = (dxPermeability * dxPermeability + dyPermeability * dyPermeability) * Math.sqrt(2 * Math.PI)

    // Smoothstep
    const bgPermittivity = -nativeSmoothStep(circleDistPermittivity)
    const bgPermeability = -nativeSmoothStep(circleDistPermeability)
    const backgroundPermittivity = permittivityValue >= 0.1 ? 1 + bgPermittivity : bgPermittivity
    const backgroundPermeability = permeabilityValue >= 0.1 ? 1 + bgPermeability : bgPermeability

    const background = getAt(conductivity, gx, gy, x, y) / 2000

    this.color(
        Math.min(1, background + eEnergy + 0.8 * backgroundPermittivity * permittivityValue),
        Math.min(1, background + eEnergy + mEnergy),
        Math.min(1, background + mEnergy + 0.8 * backgroundPermeability * permeabilityValue))
}

// On CPU we can't use float indices so round the coordinates
export function drawCpu(this: IKernelFunctionThis, electricFieldX: number[][], electricFieldY: number[][], electricFieldZ: number[][],
    magneticFieldX: number[][], magneticFieldY: number[][], magneticFieldZ: number[][],
    permittivity: number[][], permeability: number[][], conductivity: number[][], gridSize: number[], cellSize: number) {
    const gx = gridSize[0]
    const gy = gridSize[1]

    const fx = gx * this.thread.x! / (this.output.x as number)
    const fy = gy * (1 - this.thread.y! / (this.output.y as number))
    const x = Math.round(fx)
    const y = Math.round(fy)

    // Make brighter for finer grids. As there are more cells, the energy is spread out instead
    // of concentrated in less cells so we need to make it brighter.
    const fieldBrightness = (0.02 * 0.02) / (cellSize * cellSize)

    const eX = getAt(electricFieldX, gx, gy, x, y)
    const eY = getAt(electricFieldY, gx, gy, x, y)
    const eZ = getAt(electricFieldZ, gx, gy, x, y)
    const eEnergy = fieldBrightness * fieldBrightness * (eX * eX + eY * eY + eZ * eZ)

    // Magnetic field is offset from electric field, so get value at -0.5 by interpolating 0 and 1
    const mX = getAt(magneticFieldX, gx, gy, x, y)
    const mY = getAt(magneticFieldY, gx, gy, x, y)
    const mZ = getAt(magneticFieldZ, gx, gy, x, y)
    const mEnergy = fieldBrightness * fieldBrightness * (mX * mX + mY * mY + mZ * mZ)

    // Material constants are between 1 and 100, map to [0, 1] using tanh(0.5 * (x-1))
    const permittivityValue = (2 / (1 + Math.exp(-0.5 * (getAt(permittivity, gx, gy, x, y) - 1))) - 1)
    const permeabilityValue = (2 / (1 + Math.exp(-0.5 * (getAt(permeability, gx, gy, x, y) - 1))) - 1)

    // Display material as circles. Permittivity and permeability are offset circles from each other.
    const tileFactorX = Math.min(1, 1 / Math.round(2 * gx / this.output.x))
    const tileFactorY = Math.min(1, 1 / Math.round(2 * gy / this.output.y!))

    const dxPermittivity = ((tileFactorX * fx) % 1) - 0.5
    const dyPermittivity = ((tileFactorY * fy) % 1) - 0.5

    const circleDistPermittivity = (dxPermittivity * dxPermittivity + dyPermittivity * dyPermittivity) * Math.sqrt(2 * Math.PI)

    const dxPermeability = ((tileFactorX * fx + 0.5) % 1) - 0.5
    const dyPermeability = ((tileFactorY * fy + 0.5) % 1) - 0.5
    const circleDistPermeability = (dxPermeability * dxPermeability + dyPermeability * dyPermeability) * Math.sqrt(2 * Math.PI)

    // Smoothstep
    const bgPermittivity = -nativeSmoothStep(circleDistPermittivity)
    const bgPermeability = -nativeSmoothStep(circleDistPermeability)
    const backgroundPermittivity = permittivityValue >= 0.1 ? 1 + bgPermittivity : bgPermittivity
    const backgroundPermeability = permeabilityValue >= 0.1 ? 1 + bgPermeability : bgPermeability

    const background = getAt(conductivity, gx, gy, x, y) / 2000

    this.color(
        Math.min(1, background + eEnergy + 0.8 * backgroundPermittivity * permittivityValue),
        Math.min(1, background + eEnergy + mEnergy),
        Math.min(1, background + mEnergy + 0.8 * backgroundPermeability * permeabilityValue))
}