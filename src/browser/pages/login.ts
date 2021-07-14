import { getOptions } from "../../common/util"
import "../register"

const options = getOptions()
const password = document.getElementById("password") as HTMLInputElement

/**
 * Insert options embedded in the HTML or query params.
 */
if (password && options.key) {
  password.value = options.key
}
