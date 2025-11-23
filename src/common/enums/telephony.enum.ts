export enum CallDirection {
    Inbound = 'inbound',
    Outbound = 'outbound',
}

export enum CallStatus {
    Queued = 'queued',
    Ringing = 'ringing',
    InProgress = 'in-progress',
    Completed = 'completed',
    Busy = 'busy',
    Failed = 'failed',
    NoAnswer = 'no-answer',
    Canceled = 'canceled',
    Unknown = 'unknown',
}

export enum CallResult {
    None = 'none',
    AppointmentBooked = 'appointment_booked',
    CallTransferred = 'call_transferred',
    Other = 'other',
}

export enum CallIntent {
    None = 'none',
    TradeIn = 'trade_in',
    Finance = 'finance',
    Credit = 'credit',
    Appointment = 'appointment',
    Other = 'other',
}

export enum CallLogSortBy {
    CallStartedAt = 'callStartedAt',
}


