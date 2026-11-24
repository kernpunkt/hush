import {
  SecretListEntry,
  paginateListSecrets,
} from "@aws-sdk/client-secrets-manager";
import BaseRequest from "./BaseRequest.js";

class ListSecretsRequest extends BaseRequest {
  /**
   * Every secret of the region, following NextToken over all pages. With a
   * prefix, AWS returns only secrets whose name starts with it, so fewer
   * pages are needed. The AWS name filter is a prefix match that ignores
   * case, so callers still compare the names exactly.
   */
  public async execute(namePrefix?: string): Promise<SecretListEntry[]> {
    const pages = paginateListSecrets(
      { client: this.getClient() },
      namePrefix ? { Filters: [{ Key: "name", Values: [namePrefix] }] } : {}
    );

    const secrets: SecretListEntry[] = [];
    for await (const page of pages) {
      secrets.push(...(page.SecretList ?? []));
    }
    return secrets;
  }
}

export default ListSecretsRequest;
