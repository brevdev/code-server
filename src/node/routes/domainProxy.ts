import { Request, Router } from "express"
// import * as fs from "fs"
// import path from "path"
import { HttpCode, HttpError } from "../../common/http"
import { normalize } from "../../common/util"
import { authenticated, ensureAuthenticated, redirect } from "../http"
import { proxy } from "../proxy"
import { Router as WsRouter } from "../wsRouter"

export const router = Router()

/**
 * Return the port if the request should be proxied. Anything that ends in a
 * proxy domain and has a *single* subdomain should be proxied. Anything else
 * should return `undefined` and will be handled as normal.
 *
 * For example if `coder.com` is specified `8080.coder.com` will be proxied
 * but `8080.test.coder.com` and `test.8080.coder.com` will not.
 *
 * This example changes to `coder.com`, `8080-coder.com` if the user sets
 * the proxy port separator to be a dash.
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

router.all("*", async (req, res, next) => {
  const port = maybeProxy(req)
  if (!port) {
    return next()
  }

  // Check if user has manually opened ports
  // const root = path.dirname(__dirname)
  // const openPortsFile = fs.readFileSync(root, "utf-8")
  // console.log(">>>>>>>>> openPortsFile", openPortsFile)
  // const openPorts = openPortsFile.split(",")
  // console.log(">>>>>>>>> openPorts", openPorts)
  // if (port in openPorts) {
  //   return next()
  // }

  // const ROOT = path.join(__dirname, '../../../')
  // fs.readFileSync(path.join(ROOT, 'build/.cachesalt'))

  // Must be authenticated to use the proxy.
  const isAuthenticated = await authenticated(req)
  if (!isAuthenticated) {
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

  proxy.web(req, res, {
    ignorePath: true,
    target: `http://0.0.0.0:${port}${req.originalUrl}`,
  })
})

export const wsRouter = WsRouter()

wsRouter.ws("*", async (req, _, next) => {
  const port = maybeProxy(req)
  if (!port) {
    return next()
  }

  // Must be authenticated to use the proxy.
  await ensureAuthenticated(req)

  proxy.ws(req, req.ws, req.head, {
    ignorePath: true,
    target: `http://0.0.0.0:${port}${req.originalUrl}`,
  })
})
