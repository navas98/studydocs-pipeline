// A transient failure may succeed on retry (e.g. S3 timeout); a permanent
// one never will (e.g. the file isn't actually a PDF). The worker uses this
// distinction to decide whether to let the message be redelivered or fail
// the document immediately, per section 10 of the design doc.
export class TransientProcessingError extends Error {}

export class PermanentProcessingError extends Error {}
