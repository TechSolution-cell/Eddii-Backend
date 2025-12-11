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

    // Call never actually connected (busy, failed, no answer, etc.)
    NotConnected = 'not_connected',

    AppointmentRequested = 'appointment_requested',
    AppointmentBooked = 'appointment_booked',
    AppointmentRescheduled = 'appointment_rescheduled',
    AppointmentCancelled = 'appointment_cancelled',

    CallTransferred = 'call_transferred',

    NotInterested = 'not_interested',

    FollowUp = 'follow_up',

    Other = 'other',
}

export enum CallIntent {
    None = 'none',

    // Sales-focused intents
    Purchase = 'purchase',
    TradeIn = 'trade_in',
    Finance = 'finance',
    Credit = 'credit',
    Appointment = 'appointment',

    // catch-all
    Other = 'other',
}

export enum CallDepartment {
    None = 'none',       // not classified / not enough info / system skipped it
    Sales = 'sales',     // buy/lease/sell/trade/finance a vehicle
    Service = 'service', // repair/maintenance/recall/warranty work
    Parts = 'parts',     // ordering parts/accessories, parts dept
    Other = 'other',     // clearly NOT sales/service/parts (HR, vendor, personal, etc.)
}

export enum CallLogSortBy {
    CallStartedAt = 'callStartedAt',
}


