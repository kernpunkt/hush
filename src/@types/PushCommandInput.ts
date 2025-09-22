type PushCommandInput = {
  key: string;
  envFile: string;
  message?: string;
  version?: number;
  force?: boolean;
};
export default PushCommandInput;
