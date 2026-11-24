import SecretBackend from "./SecretBackend.js";
import AwsBackend from "./aws/AwsBackend.js";

/**
 * The backend without a project setting: the AWS Secrets Manager in
 * eu-central-1, as in Hush! 4.1.0 (BR-04). With a hush.config.json,
 * ProjectBackends picks the backend per key instead.
 */
export default function defaultBackend(): SecretBackend {
  return new AwsBackend();
}
