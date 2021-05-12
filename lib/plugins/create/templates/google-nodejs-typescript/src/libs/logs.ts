import type { Request } from 'express';

export enum GCPLogEntrySeverity {
  DEFAULT = 'DEFAULT', // (0) The log entry has no assigned severity level.
  DEBUG = 'DEBUG', // (100) Debug or trace information.
  INFO = 'INFO', // (200) Routine information, such as ongoing status or performance.
  NOTICE = 'NOTICE', // (300) Normal but significant events, such as start up, shut down, or a configuration change.
  WARNING = 'WARNING', // (400) Warning events might cause problems.
  ERROR = 'ERROR', // (500) Error events are likely to cause problems.
  CRITICAL = 'CRITICAL', // (600) Critical events cause more severe problems or outages.
  ALERT = 'ALERT', // (700) A person must take an action immediately.
  EMERGENCY = 'EMERGENCY', // (800) One or more systems are unusable.
}
type JSONPayload = {
  message?: string;
  [key: string]: Record<string, unknown> | string | undefined;
};
type Payload = string | JSONPayload;
export const JSON_PAYLOAD_MESSAGE =
  'This log contains a JSON payload, use GCP log explorer to see it';

class Logger {
  req: Request | undefined;

  init = (req: Request) => {
    this.req = req;
  };

  log = (payload: Payload): void => {
    const entry = this.logEntry();
    let message: string;
    let jsonPayload: JSONPayload | undefined;
    if (typeof payload === 'object') {
      message = payload.message ?? JSON_PAYLOAD_MESSAGE;
      jsonPayload = payload;
    } else {
      message = payload;
    }
    console.log(JSON.stringify(entry(GCPLogEntrySeverity.INFO, message, jsonPayload)));
  };

  error = (error: Error): void => {
    const entry = this.logEntry();
    const { message, stack } = error;

    console.log(JSON.stringify(entry(GCPLogEntrySeverity.ERROR, message, { stack })));
  };

  logEntry = () => (
    severity: GCPLogEntrySeverity,
    message: string,
    jsonPayload: JSONPayload = {}
  ): Record<string, unknown> => ({
    severity,
    message,
    ...jsonPayload,
    ...this.getCloudTrace(),
  });

  getCloudTrace = (): Record<string, string> => {
    const project = process.env.GCP_PROJECT; // GCP_PROJECT is always set by the runner of the cloud function

    const traceHeader = this.req?.header('X-Cloud-Trace-Context');
    if (traceHeader !== undefined && project !== undefined) {
      const [trace] = traceHeader.split('/');
      return { 'logging.googleapis.com/trace': `projects/${project}/traces/${trace}` };
    }
    return {};
  };
}

export const logger = new Logger();
