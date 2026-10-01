import StringMap from "../@types/StringMap.js";
import TypedException from "../@types/TypedException.js";

class TypedErrorHandler {
  protected isTypedException(error: any): error is TypedException {
    return "__type" in error;
  }

  public handleError(error: any, mapping: StringMap) {
    if (this.isTypedException(error)) {
      if (Object.keys(mapping).includes(error["__type"])) {
        throw new Error(mapping[error["__type"]]);
      }
      throw error;
    }

    throw error;
  }
}

export default TypedErrorHandler;
