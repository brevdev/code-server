import { logger } from "@coder/logger"
import * as chokidar from "chokidar"
import fs from "fs"
import * as joi from "joi"
import yaml from "js-yaml"
import picomatch from "picomatch"

export interface PortFile {
  ports: PortOrPortMapping[]
}
const portFileSchema = joi.object({
  version: joi.string(),
  ports: joi.array().items(joi.string()),
})

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
  private portFiles: { [relPath: string]: PortFile } = {}
  private searchPath: string | undefined = undefined

  public constructor(
    private readonly portsGlob: string = "**/.brev/ports.y*ml",
    private readonly ignoredGlob: string = "**/node_modules**",
    private readonly searchDepth: number = 100,
  ) {}

  public startWatch(searchPath: string) {
    this.searchPath = searchPath
    logger.debug(`searching for public ports ${this.searchPath}`)
    const watcher = chokidar.watch([this.portsGlob], {
      ignored: this.ignoredGlob,
      cwd: this.searchPath,
      followSymlinks: false,
      depth: this.searchDepth,
    })
    watcher.on("add", (relPath) => this.putFile(relPath))
    watcher.on("change", (relPath) => this.putFile(relPath))
    watcher.on("unlink", (relPath) => this.deleteFile(relPath))
  }

  public getPublicPort(portOrAlias: PortOrAlias): Port | null {
    const ports = this.getPublicPorts()
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
    return this.portFileToPorts(mergedPorts)
  }

  private mergePortFiles(): PortFile {
    return Object.values(this.portFiles).reduce(
      (prevValue, currValue, index, portFiles): PortFile => {
        currValue.ports.forEach((port) => {
          if (!prevValue.ports.includes(port)) {
            prevValue.ports.push(port)
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
    return file.ports.reduce((prevValue: Ports, currValue, index, portFiles): Ports => {
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
    if (publicPorts === null) {
      logger.warn(`malformed ports file ${relPath}`)
      return
    }
    logger.debug(`puting ports file ${relPath}`)
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
      yamlData = yaml.load(fs.readFileSync(path, "utf8"))
    } catch (e) {
      logger.warn(path)
      logger.warn(e.toString())
      return null
    }

    const res = portFileSchema.validate(yamlData)
    if (res.error !== undefined) {
      logger.warn(path)
      logger.warn(res.error.message)
      return null
    }
    return res.value
  }

  private getFullPath(relPath: string): string {
    return this.searchPath + "/" + relPath
  }
}
