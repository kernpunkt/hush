import SecretBackend from "./SecretBackend.js";
import AwsBackend from "./aws/AwsBackend.js";

/**
 * The backend commands use unless one is set: the AWS Secrets Manager, as in
 * Hush! 4.1.0. Choosing the backend per key from the project settings
 * replaces this later.
 */
export default function defaultBackend(): SecretBackend {
  return new AwsBackend();
}
