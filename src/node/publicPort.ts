import { logger } from "@coder/logger"
import chokidar from "chokidar"
import fs from "fs"
import joi from "joi"
import yaml from "js-yaml"
import picomatch from "picomatch"
import { DefaultedArgs } from "./cli";

export interface PortFile {
  version?: string
  ports?: PortOrPortMapping[]
}

const portFileSchema = joi
  .object({
    version: joi.string().optional(),
    ports: [joi.array().items(joi.string()), joi.allow(null)],
  })
  .allow(null)

type PortOrPortMapping = Port | PortMapping
type PortMapping = string // "PortOrAlias:Port" ex: 9000:8000 or my-server:8080
type PortOrAlias = Port | Alias

type Alias = string // ex: my-server
type Port = string // ex: "8000"

interface Ports {
  [PortOrAlias: string]: Port
}

/**
 * Provides a interface for efficiently retrieving modifyiable public ports files
 */
export class PublicPorts {
  private watcher?: chokidar.FSWatcher
  private portFiles: { [relPath: string]: PortFile } = {}
  private searchPath: string | undefined = undefined

  public constructor(
    private readonly portsGlob: string = "**/.brev/ports.y*ml",
    private readonly ignoredGlob: string = "**/node_modules**",
    private readonly searchDepth: number = 50,
  ) {}

  public startWatch(searchPath: string, args: DefaultedArgs) {
    this.searchPath = searchPath
    logger.debug(`searching for public ports ${this.searchPath}`)
    logger.trace(`settings polling: ${args["polling"]}`)
    logger.trace(`settings polling-interval: ${args["polling-interval"]}`)
    this.watcher = chokidar.watch([this.portsGlob], {
      ignored: this.ignoredGlob,
      cwd: this.searchPath,
      followSymlinks: false,
      depth: this.searchDepth,
      usePolling: args["polling"],
      interval: args["polling-interval"],
    })
    this.watcher.on("add", (relPath) => this.putFile(relPath))
    this.watcher.on("change", (relPath) => this.putFile(relPath))
    this.watcher.on("unlink", (relPath) => this.deleteFile(relPath))
  }

  public endWatch() {
    logger.debug("Ending watch for public ports")
    if (typeof this.watcher !== "undefined") {
      this.watcher.close().then(() => console.log("watcher closed"))
    }
  }

  public getPublicPort(portOrAlias: PortOrAlias): Port | null {
    logger.trace(`portOrAlias: ${portOrAlias}`)
    const ports = this.getPublicPorts()
    logger.trace(`ports: ${JSON.stringify(ports)}`)
    if (ports[portOrAlias] !== undefined) {
      return ports[portOrAlias]
    } else {
      return null
    }
  }

  private getPublicPorts(): Ports {
    if (this.searchPath === undefined) {
      throw new Error("searchPath not defined -- startWatch not yet called")
    }
    const mergedPorts = this.mergePortFiles()
    logger.trace(`mergedPorts: ${JSON.stringify(mergedPorts)}`)
    return this.portFileToPorts(mergedPorts)
  }

  private mergePortFiles(): PortFile {
    logger.trace(`this.portFiles: ${JSON.stringify(this.portFiles)}`)
    return Object.values(this.portFiles).reduce(
      (prevValue, currValue, index, portFiles): PortFile => {
        currValue.ports?.forEach((port) => {
          if (!prevValue.ports?.includes(port)) {
            prevValue.ports?.push(port)
          }
        })
        return prevValue
      },
      {
        ports: [],
      },
    )
  }

  private portFileToPorts(file: PortFile): Ports {
    if (file.ports === null || file.ports === undefined) return {}
    return file.ports.reduce((prevValue: Ports, currValue): Ports => {
      const mapping = this.parsePortOrPortMapping(currValue)
      if (mapping === null) {
        return prevValue
      }
      prevValue[mapping[0]] = mapping[1]
      return prevValue
    }, {})
  }

  private parsePortOrPortMapping(portOrMapping: PortOrPortMapping): [PortOrAlias, Port] | null {
    if (portOrMapping.includes(":")) {
      const res = portOrMapping.split(":")
      const portOrAlias = this.validatePortOrAlias(res[0])
      if (portOrAlias === null) {
        logger.warn(`invalid port or alias ${res[0]}`)
        return null
      }
      const port = this.validatePort(res[1])
      if (port === null) {
        logger.warn(`invalid port ${res[1]}`)
        return null
      }
      return [portOrAlias, port]
    } else {
      const port = this.validatePort(portOrMapping)
      if (port === null) {
        logger.warn(`invalid port ${portOrMapping}`)
        return null
      }
      return [port, port]
    }
  }

  private validatePort(port: Port): Port | null {
    const r = RegExp(/^[0-9]+$/i)
    if (r.test(port)) {
      return port
    } else {
      return null
    }
  }
  private validatePortOrAlias(portOrAlias: PortOrAlias): PortOrAlias | null {
    const r = RegExp(/^[a-z0-9]+$/)
    if (r.test(portOrAlias)) {
      return portOrAlias
    } else {
      return null
    }
  }

  private putFile(relPath: string) {
    if (!this.didMatchGlob(relPath)) {
      return
    }
    const publicPorts = this.getPublicPortsFromFile(relPath)
    logger.trace(`publicPorts: ${JSON.stringify(publicPorts)}`)
    if (publicPorts === null) {
      logger.warn(`malformed ports file ${relPath}`)
      return
    }
    logger.debug(`storing ports file ${relPath}`)
    logger.trace(`\n\n`)
    this.portFiles[relPath] = publicPorts
  }

  private deleteFile(relPath: string) {
    if (!this.didMatchGlob(relPath)) {
      return
    }
    logger.debug(`deleting ports file ${relPath}`)
    delete this.portFiles[relPath]
  }

  private didMatchGlob(relPath: string): boolean {
    const isMatch = picomatch(this.portsGlob)
    return isMatch(relPath)
  }

  private getPublicPortsFromFile(relPath: string): PortFile | null {
    let yamlData
    const path = this.getFullPath(relPath)
    try {
      const f = fs.readFileSync(path, "utf8")
      logger.trace(`f: ${JSON.stringify(f)}`)
      yamlData = yaml.load(f)
      logger.trace(`yamlData: ${JSON.stringify(yamlData)}`)
    } catch (e) {
      logger.warn(path)
      logger.warn(JSON.stringify(e))
      return null
    }

    const res = portFileSchema.validate(yamlData)
    logger.trace(`res: ${JSON.stringify(res)}`)
    logger.trace(`res.error: ${JSON.stringify(res.error)}`)
    if (res.error !== undefined) {
      logger.warn(path)
      logger.warn(res.error.message)
      return { ports: [] }
    }
    logger.trace(`res.value: ${JSON.stringify(res.value)}`)
    return res.value || { ports: [] }
  }

  private getFullPath(relPath: string): string {
    return this.searchPath + "/" + relPath
  }
}
