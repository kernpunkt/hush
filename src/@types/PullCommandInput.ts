type PullCommandInput = {
  key: string;
  envFile: string;
  force?: boolean;
  password?: string;
};

export default PullCommandInput;
