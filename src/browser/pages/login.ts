import { getOptions } from "../../common/util"
import "../register"

const options = getOptions()
const anyElem = document.getElementById("any-elem") as HTMLInputElement

/**
 * Insert options embedded in the HTML or query params.
 */
if (anyElem && options.base) {
  anyElem.value = options.base
}
