import { Request, Router } from "express"
import { HttpCode, HttpError } from "../../common/http"
import { normalize } from "../../common/util"
import { authenticated, redirect } from "../http"
import { proxy } from "../proxy"
import { PublicPorts } from "../publicPort"
import { Router as WsRouter } from "../wsRouter"

export const router = Router()

export const publicPorts = new PublicPorts()

/**
 * Return the port if the request should be proxied. Anything that ends in a
 * proxy domain and has a *single* subdomain should be proxied. Anything else
 * should return `undefined` and will be handled as normal.
 *
 * For example if `coder.com` is specified `8080.coder.com` will be proxied
 * but `8080.test.coder.com` and `test.8080.coder.com` will not.
 */
const maybeProxy = (req: Request): string | undefined => {
  // Split into parts.
  const host = req.headers.host || ""
  const idx = host.indexOf(":")
  const domain = idx !== -1 ? host.substring(0, idx) : host
  const separator = req.args["proxy-port-separator"] === "dash" ? "-" : "."
  const parts = domain.split(separator)

  // There must be an exact match.
  const port = parts.shift()
  const proxyDomain = parts.join(separator)
  if (!port || !req.args["proxy-domain"].includes(proxyDomain)) {
    return undefined
  }

  return port
}

// const publicPortsSearchPath = WORKSPACE_HOME_DIRECTORY_PATH
// logger.debug(`Public ports search path: ${publicPortsSearchPath}`)
// initPortsCache("/Users/alecfong/Source/brev/code-server")

router.all("*", async (req, res, next) => {
  const port = maybeProxy(req)
  if (!port) {
    return next()
  }

  const foundPublicPort = publicPorts.getPublicPort(port)
  const portIsPublic = foundPublicPort !== null

  const isAuthenticated = await authenticated(req)
  if (!isAuthenticated && !portIsPublic) {
    // Let the assets through since they're used on the login page.
    if (req.path.startsWith("/static/") && req.method === "GET") {
      return next()
    }

    // Assume anything that explicitly accepts text/html is a user browsing a
    // page (as opposed to an xhr request). Don't use `req.accepts()` since
    // *every* request that I've seen (in Firefox and Chromium at least)
    // includes `*/*` making it always truthy. Even for css/javascript.
    if (req.headers.accept && req.headers.accept.includes("text/html")) {
      // Let the login through.
      if (/\/login\/?/.test(req.path)) {
        return next()
      }
      // Redirect all other pages to the login.
      const to = normalize(`${req.baseUrl}${req.path}`)
      return redirect(req, res, "login", {
        to: to !== "/" ? to : undefined,
      })
    }

    // Everything else gets an unauthorized message.
    throw new HttpError("Unauthorized", HttpCode.Unauthorized)
  }

  const mappedPort = foundPublicPort !== null ? foundPublicPort : port

  proxy.web(req, res, {
    ignorePath: true,
    target: `http://0.0.0.0:${mappedPort}${req.originalUrl}`,
  })
})

export const wsRouter = WsRouter()

wsRouter.ws("*", async (req, _, next) => {
  const port = maybeProxy(req)
  if (!port) {
    return next()
  }

  const foundPublicPort = publicPorts.getPublicPort(port)
  const portIsPublic = foundPublicPort !== null

  const isAuthenticated = await authenticated(req)
  if (!isAuthenticated && !portIsPublic) {
    throw new HttpError("Unauthorized", HttpCode.Unauthorized)
  }

  const mappedPort = foundPublicPort !== null ? foundPublicPort : port

  proxy.ws(req, req.ws, req.head, {
    ignorePath: true,
    target: `http://0.0.0.0:${mappedPort}${req.originalUrl}`,
  })
})
