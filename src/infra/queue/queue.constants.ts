export const RECORDING_WORKFLOW_QUEUE = 'recording-workflow';
export const JOB_ENSURE_PROCESSED = 'ensure-processed';

export type EnsureProcessedJob = {
  callSid: string; // twilio call sid
  recordingUrlBase: string; // twilio recording url
};
